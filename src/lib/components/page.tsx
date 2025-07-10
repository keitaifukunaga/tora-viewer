// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { jsxFactory } from './base';
import { PageBase } from './page-base';
import { LoadablePageContent, PageContent } from '../interfaces/page-content';
import { isMobileDevice } from '../utils/device-detection';
import { getCanvasDPR } from '../utils/device-detection';

export interface PageSize {
  width: number;
  height: number;
}

interface Props {
  index: number;
  size: PageSize;
  onTapLeft: () => void;
  onTapRight: () => void;
}

export class Page extends PageBase {
  #size: PageSize;
  #pageRatio: number;
  #loadablePageContent: LoadablePageContent;
  #contentLoaded = false;
  #contentLoadedSuccess = false;

  #thumbnailElement: HTMLImageElement;
  #canvasRef: JSX.RefElement<HTMLCanvasElement>;

  // ダブルタップ拡大機能用の変数
  #isZoomed = false;
  #zoomScale = 1;
  #zoomMaxScale = 3;
  #zoomMinScale = 1;
  #lastTapTime = 0;
  #lastTapX = 0;
  #lastTapY = 0;
  #tapTimeout: number | null = null;
  #isPanning = false;
  #panStartX = 0;
  #panStartY = 0;
  #translateX = 0;
  #translateY = 0;
  #initialDistance = 0;
  #initialScale = 1;
  #transformOriginX = 50; // パーセンテージ
  #transformOriginY = 50; // パーセンテージ

  constructor(loadablePageContent: LoadablePageContent, props: Props) {
    super(props);

    // 初期表示に使うサイズ ※画像ロード時に画像に合わせたサイズになる
    this.#size = props.size;
    this.#pageRatio = props.size.width / props.size.height;

    this.#loadablePageContent = loadablePageContent;

    this.#canvasRef = this.createRef((canvas) => {
      // モバイルでのみダブルタップ拡大機能を有効化
      if (isMobileDevice()) {
        this.#setupTouchEvents(canvas);
      }
    });
    this.#thumbnailElement = new Image();
    this.#thumbnailElement.classList.add('viewer-page-thumbnail-content');
    this.showLoading();
  }

  // PageBaseのsetup関数をオーバーライドして、タップエリアにもイベントリスナーを追加
  setup(func: (el: HTMLElement) => void) {
    super.setup(func);
    
    // モバイルでのダブルタップ拡大機能をタップエリアにも適用
    if (isMobileDevice()) {
      // ページ要素が準備されたらタップエリアにイベントリスナーを追加
      if (this.element) {
        this.#setupTapAreaEvents(this.element);
      }
    }
  }

  // タップエリアにタッチイベントを設定
  #setupTapAreaEvents(pageElement: HTMLElement) {
    const tapAreaLeft = pageElement.querySelector('.viewer-page-tap-area.viewer-page-area-left') as HTMLElement;
    const tapAreaRight = pageElement.querySelector('.viewer-page-tap-area.viewer-page-area-right') as HTMLElement;

    if (tapAreaLeft) {
      this.#setupTouchEvents(tapAreaLeft);
    }
    if (tapAreaRight) {
      this.#setupTouchEvents(tapAreaRight);
    }
  }

  protected pageClasses(): string[] {
    const classes = ['regular-page'];
    if (this.#isZoomed) {
      classes.push('zoomed');
    }
    return classes;
  }

  protected createElementPage() {
    return (
      <canvas
        width={this.#size.width}
        height={this.#size.height}
        classNames={['viewer-page-content']}
        ref={this.#canvasRef}
      />
    );
  }

  createThumbnailElementPage() {
    return this.#thumbnailElement;
  }

  get loaded() {
    return this.#contentLoaded;
  }

  // タッチイベントの設定
  #setupTouchEvents(element: HTMLElement) {
    let touchStartTime = 0;
    let isSingleTouch = false;

    // タッチ開始
    element.addEventListener('touchstart', (e) => {
      touchStartTime = Date.now();
      
      if (e.touches.length === 1) {
        isSingleTouch = true;
        this.#handleTouchStart(e.touches[0]);
      } else if (e.touches.length === 2) {
        isSingleTouch = false;
        this.#handlePinchStart(e.touches[0], e.touches[1]);
      }
    });

    // タッチ移動
    element.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.#isZoomed) {
        e.preventDefault();
        this.#handleTouchMove(e.touches[0]);
      } else if (e.touches.length === 2 && this.#isZoomed) {
        e.preventDefault();
        this.#handlePinchMove(e.touches[0], e.touches[1]);
      }
    });

    // タッチ終了
    element.addEventListener('touchend', (e) => {
      const touchDuration = Date.now() - touchStartTime;
      
      if (isSingleTouch && touchDuration < 300 && !this.#isPanning) {
        // イベントの伝播を停止してページめくりを防ぐ
        e.preventDefault();
        e.stopPropagation();
        this.#handleTap();
      }
      
      this.#handleTouchEnd();
    });

    // スクロールを防ぐ
    element.addEventListener('touchmove', (e) => {
      if (this.#isZoomed) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  // シングルタップ処理
  #handleTap() {
    const currentTime = Date.now();
    const tapGap = currentTime - this.#lastTapTime;

    if (tapGap < 300 && tapGap > 0) {
      // ダブルタップ検出
      if (this.#tapTimeout) {
        clearTimeout(this.#tapTimeout);
        this.#tapTimeout = null;
      }
      this.#handleDoubleTap();
    } else {
      // シングルタップ（遅延実行）
      this.#tapTimeout = window.setTimeout(() => {
        // 既存のタップ処理は無効化（拡大時のみ）
        this.#tapTimeout = null;
      }, 300);
    }

    this.#lastTapTime = currentTime;
  }

  // ダブルタップ処理
  #handleDoubleTap() {
    if (this.#isZoomed) {
      // 拡大状態から元に戻す
      this.#resetZoom();
    } else {
      // タップした位置を基準に2倍拡大
      this.#zoomToPoint(this.#lastTapX, this.#lastTapY, 2);
    }
  }

  // 指定した位置を中心に拡大
  #zoomToPoint(clientX: number, clientY: number, scale: number) {
    const canvas = this.#canvasRef.current;
    if (!canvas) return;

    // canvas要素の位置とサイズを取得
    const canvasRect = canvas.getBoundingClientRect();
    
    // タップ位置がcanvas要素の範囲内かチェック
    const isWithinCanvas = clientX >= canvasRect.left && clientX <= canvasRect.right &&
                          clientY >= canvasRect.top && clientY <= canvasRect.bottom;
    
    let relativeX: number = 0.5; // デフォルト値
    let relativeY: number = 0.5; // デフォルト値
    
    if (isWithinCanvas) {
      // canvas内でのタップの場合、直接的な相対位置を計算
      relativeX = (clientX - canvasRect.left) / canvasRect.width;
      relativeY = (clientY - canvasRect.top) / canvasRect.height;
    } else {
      // タップエリアでのタップの場合、位置を推測
      const pageElement = canvas.closest('.viewer-page');
      if (pageElement) {
        const leftTapArea = pageElement.querySelector('.viewer-page-tap-area.viewer-page-area-left');
        const rightTapArea = pageElement.querySelector('.viewer-page-tap-area.viewer-page-area-right');
        
        if (leftTapArea) {
          const leftRect = leftTapArea.getBoundingClientRect();
          if (clientX >= leftRect.left && clientX <= leftRect.right &&
              clientY >= leftRect.top && clientY <= leftRect.bottom) {
            // 左端のタップエリア：画像の左側25%を基準に拡大
            relativeX = 0.25;
            relativeY = 0.5;
          }
        }
        
        if (rightTapArea) {
          const rightRect = rightTapArea.getBoundingClientRect();
          if (clientX >= rightRect.left && clientX <= rightRect.right &&
              clientY >= rightRect.top && clientY <= rightRect.bottom) {
            // 右端のタップエリア：画像の右側75%を基準に拡大
            relativeX = 0.75;
            relativeY = 0.5;
          }
        }
      }
    }
    
    // パーセンテージに変換（0-100%）
    this.#transformOriginX = relativeX * 100;
    this.#transformOriginY = relativeY * 100;
    
    // 境界チェック
    this.#transformOriginX = Math.max(0, Math.min(100, this.#transformOriginX));
    this.#transformOriginY = Math.max(0, Math.min(100, this.#transformOriginY));
    
    this.#zoomScale = scale;
    this.#translateX = 0;
    this.#translateY = 0;
    this.#isZoomed = true;
    
    // 拡大時も移動範囲を制限
    this.#constrainTranslation();
    
    this.#applyTransform();
    this.#updatePageClasses();
  }

  // タッチ開始（パン用）
  #handleTouchStart(touch: Touch) {
    // タップ位置を記録
    this.#lastTapX = touch.clientX;
    this.#lastTapY = touch.clientY;
    
    if (this.#isZoomed) {
      this.#isPanning = false;
      this.#panStartX = touch.clientX;
      this.#panStartY = touch.clientY;
    }
  }

  // Canvas移動範囲を制限
  #constrainTranslation() {
    const canvas = this.#canvasRef.current;
    if (!canvas) return;

    const pageElement = canvas.closest('.viewer-page') as HTMLElement;
    if (!pageElement) return;

    // 親要素（viewer-page）のサイズを取得
    const pageRect = pageElement.getBoundingClientRect();
    
    // canvasの実際の表示サイズを取得（CSS適用後）
    const canvasRect = canvas.getBoundingClientRect();
    
    // 拡大前の表示サイズを正確に取得
    const originalDisplayWidth = canvasRect.width / this.#zoomScale;
    const originalDisplayHeight = canvasRect.height / this.#zoomScale;
    
    // 拡大後のcanvasサイズ
    const scaledDisplayWidth = originalDisplayWidth * this.#zoomScale;
    const scaledDisplayHeight = originalDisplayHeight * this.#zoomScale;
    
    // transform-originを基準とした移動範囲を計算
    const totalOverflowX = Math.max(0, (scaledDisplayWidth - pageRect.width) / this.#zoomScale);
    const totalOverflowY = Math.max(0, (scaledDisplayHeight - pageRect.height) / this.#zoomScale);
    
    // 基準点のパーセンテージ（0-100%）を0-1の範囲に変換
    const originRatioX = this.#transformOriginX / 100;
    const originRatioY = this.#transformOriginY / 100;
    
    // 基準点に応じて左右/上下の移動制限を分配
    let maxTranslateRight = totalOverflowX * originRatioX;          // 右方向の最大移動量
    let maxTranslateLeft  = totalOverflowX * (1 - originRatioX);    // 左方向の最大移動量
    let maxTranslateDown  = totalOverflowY * originRatioY;          // 下方向の最大移動量
    let maxTranslateUp    = totalOverflowY * (1 - originRatioY);    // 上方向の最大移動量
    
    console.log('移動可能な範囲を計算（拡大された部分が親要素を超えないように） maxTranslateRight', maxTranslateRight , totalOverflowX, originRatioX);
    console.log('移動可能な範囲を計算（拡大された部分が親要素を超えないように） maxTranslateLeft', maxTranslateLeft, totalOverflowX, originRatioX);
    console.log('移動可能な範囲を計算（拡大された部分が親要素を超えないように） maxTranslateDown', maxTranslateDown, totalOverflowY, originRatioY);
    console.log('移動可能な範囲を計算（拡大された部分が親要素を超えないように） maxTranslateUp', maxTranslateUp, totalOverflowY, originRatioY);
    
    // マージンを入れる
    const margin = 10;
    maxTranslateRight = maxTranslateRight + margin;  // 右方向の移動範囲を増やす
    maxTranslateLeft  = maxTranslateLeft + margin;   // 左方向の移動範囲を増やす
    maxTranslateDown  = maxTranslateDown + margin;
    maxTranslateUp    = maxTranslateUp + margin;
    
    // translateXとtranslateYを制限
    this.#translateX = Math.max(-maxTranslateLeft, Math.min(maxTranslateRight, this.#translateX));
    this.#translateY = Math.max(-maxTranslateUp, Math.min(maxTranslateDown, this.#translateY));
  }

  // タッチ移動（パン処理）
  #handleTouchMove(touch: Touch) {
    if (this.#isZoomed) {
      const deltaX = touch.clientX - this.#panStartX;
      const deltaY = touch.clientY - this.#panStartY;
      
      // 最小移動距離を超えたらパンとして扱う
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        this.#isPanning = true;
        this.#translateX += deltaX;
        this.#translateY += deltaY;
        
        // 移動範囲を制限
        this.#constrainTranslation();
        
        this.#applyTransform();
        
        this.#panStartX = touch.clientX;
        this.#panStartY = touch.clientY;
      }
    }
  }

  // ピンチ開始
  #handlePinchStart(touch1: Touch, touch2: Touch) {
    const distance = this.#getDistance(touch1, touch2);
    this.#initialDistance = distance;
    this.#initialScale = this.#zoomScale;
    
    // ピンチの中心点を取得
    const centerX = (touch1.clientX + touch2.clientX) / 2;
    const centerY = (touch1.clientY + touch2.clientY) / 2;
    
    // 新しい変換原点を設定
    this.#updateTransformOrigin(centerX, centerY);
  }

  // ピンチ移動
  #handlePinchMove(touch1: Touch, touch2: Touch) {
    const distance = this.#getDistance(touch1, touch2);
    const scaleChange = distance / this.#initialDistance;
    
    this.#zoomScale = Math.min(
      Math.max(this.#initialScale * scaleChange, this.#zoomMinScale),
      this.#zoomMaxScale
    );
    
    this.#isZoomed = this.#zoomScale > 1;
    
    // 拡大率が変更されたときも移動範囲を制限
    this.#constrainTranslation();
    
    this.#applyTransform();
    this.#updatePageClasses();
  }

  // 変換原点を更新
  #updateTransformOrigin(clientX: number, clientY: number) {
    const canvas = this.#canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const relativeX = (clientX - rect.left) / rect.width;
    const relativeY = (clientY - rect.top) / rect.height;
    
    this.#transformOriginX = Math.max(0, Math.min(100, relativeX * 100));
    this.#transformOriginY = Math.max(0, Math.min(100, relativeY * 100));
  }

  // タッチ終了
  #handleTouchEnd() {
    this.#isPanning = false;
    
    // 拡大率が1以下の場合は元に戻す
    if (this.#zoomScale <= 1) {
      this.#resetZoom();
    }
  }

  // 2点間の距離を計算
  #getDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 拡大をリセット
  #resetZoom() {
    this.#zoomScale = 1;
    this.#translateX = 0;
    this.#translateY = 0;
    this.#isZoomed = false;
    this.#transformOriginX = 50;
    this.#transformOriginY = 50;
    this.#applyTransform();
    this.#updatePageClasses();
  }

  // CSS Transform を適用
  #applyTransform() {
    if (this.#canvasRef.current) {
      const transform = `scale(${this.#zoomScale}) translate(${this.#translateX}px, ${this.#translateY}px)`;
      const transformOrigin = `${this.#transformOriginX}% ${this.#transformOriginY}%`;
      
      this.#canvasRef.current.style.transform = transform;
      this.#canvasRef.current.style.transformOrigin = transformOrigin;
    }
  }

  // ページクラスを更新
  #updatePageClasses() {
    // 親のページ要素のクラスを更新
    const pageElement = this.#canvasRef.current?.closest('.viewer-page');
    if (pageElement) {
      if (this.#isZoomed) {
        pageElement.classList.add('zoomed');
      } else {
        pageElement.classList.remove('zoomed');
      }
    }
  }

  async contentLoad(): Promise<void> {
    if (this.#contentLoaded) {
      return Promise.resolve();
    }

    const ctx = this.#canvasRef.current?.getContext('2d');
    if (!ctx) {
      return Promise.reject('The rendering context is not ready.');
    }

    this.#contentLoaded = true;

    const content = await this.#loadablePageContent.load();

    const thumbnailUrl =
      typeof content === 'string'
        ? content
        : content.thumbnailUrl || content.url;
    const url = typeof content === 'string' ? content : content.url;

    this.#thumbnailElement.src = thumbnailUrl;
    this.#thumbnailElement.addEventListener('load', () => {
      img.classList.add('viewer-page-thumbnail-content-loaded');
    });

    const img = new Image();
    img.src = url;

    // エラー時に再読込できる状態に戻す
    const recoverContentLoaded = () => {
      window.setTimeout(() => {
        if (this.#contentLoadedSuccess) {
          return;
        }
        // 読み込みに成功していなければ再読み込みできる状態にする。
        this.#contentLoaded = false;
      }, 30000);
    };

    return new Promise<void>((resolve, reject) => {
      img.addEventListener('load', () => {
        this.hideLoading();
        this.#drawPageImage(ctx, img, content);
        this.#contentLoadedSuccess = true;
        resolve();
      });
      img.addEventListener('abort', reject);
      img.addEventListener('error', reject);
      img.addEventListener('abort', recoverContentLoaded);
      img.addEventListener('error', recoverContentLoaded);
    });
  }

  #drawPageImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    content: PageContent
  ) {
    // サイズ指定がされていればそのとおりに、なければ画像のサイズを取得する
    const imgWidth =
      typeof content === 'string' ? img.width : content.width ?? img.width;
    const imgHeight =
      typeof content === 'string' ? img.height : content.height ?? img.height;

    const isMobile = isMobileDevice();
    // canvasの大きさを画像に合わせる
    if (isMobile) {
      // alert('モバイル');
      if (this.#canvasRef.current) {
        this.#canvasRef.current.setAttribute('width', `${imgWidth}`);
        this.#canvasRef.current.setAttribute('height', `${imgHeight}`);

        const imgRatio = imgWidth / imgHeight;
        if (imgRatio < this.#pageRatio) {
          // 縦が長いときに切れないスタイルに切り替える
          this.#canvasRef.current.classList.add('viewer-page-vertically-long');
        }
      }
    } else {
      if (this.#canvasRef.current) {
        // alert('モバイル以外');
        // デバイスに応じた適切なDPRを取得
        const dpr = getCanvasDPR();
        if (dpr > 1) {
          // タブレット等でDPR処理が必要な場合
          this.#canvasRef.current.setAttribute('width', `${imgWidth * dpr}`);
          this.#canvasRef.current.setAttribute('height', `${imgHeight * dpr}`);

          // CSS上の表示サイズは元のサイズのまま
          this.#canvasRef.current.style.width = `${imgWidth}px`;
          this.#canvasRef.current.style.height = `${imgHeight}px`;

          // Context をDPRに合わせてスケーリング
          ctx.scale(dpr, dpr);
        } else {
          // スマホ等でDPR処理が不要な場合（従来通り）
          this.#canvasRef.current.setAttribute('width', `${imgWidth}`);
          this.#canvasRef.current.setAttribute('height', `${imgHeight}`);
        }

        const imgRatio = imgWidth / imgHeight;
        if (imgRatio < this.#pageRatio) {
          // 縦が長いときに切れないスタイルに切り替える
          this.#canvasRef.current.classList.add('viewer-page-vertically-long');
        }
      }
    }

    // 画像を描画
    ctx.drawImage(img, 0, 0, imgWidth, imgHeight, 0, 0, imgWidth, imgHeight);
  }
}
