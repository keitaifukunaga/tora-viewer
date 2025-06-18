import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { jsxFactory } from './base';
import { ComponentBase } from './base';
import { PageBase } from './page-base';
import { Page, type PageSize } from './page';
import { EmptyPage } from './empty-page';
import { EmbedPage } from './embed-page';
import { appName, PageStyle, ViewerDirection } from '../constants';
import { LoadablePageContent } from '../interfaces/page-content';
import { createFaIcon } from '../utils/create-fa-icon';
import { ControlArea } from './control-area';
import { ViewSettings } from './view-settings';

export interface BaseProps {
  pageSize: PageSize;
  pageStyle: PageStyle;
  direction: ViewerDirection;
  modal: boolean;
  title: string;
  controlShowTime: number;
  scrollDuration?: number; // スクロールアニメーションの時間（ミリ秒）
  lastPageElement?: HTMLElement;
  showLastPage?: boolean; // 最終ページの表示可否を制御するオプション
  autoClose?: boolean; // 最終ページで自動的に閉じるかどうかのオプション
}

interface Props extends BaseProps {
  onDispose: () => void;
}

type CurrentIndexChangeHandler = (index: number) => void;

const FIRST_PAGE_SHOWN = 'viewer-first-page-shown';
const LAST_PAGE_SHOWN = 'viewer-last-page-shown';

export class Main extends ComponentBase {
  /** コンテンツのページ一覧 */
  readonly pages: Page[];
  /** 空ページ(奇数ページで見開き表示時に表示させる) */
  #blankPage: EmptyPage;
  /** 最終ページ */
  #lastPage: EmbedPage | null;
  /** コンテンツのページ、空ページ、最終ページ全部含めたページ一覧 */
  #allPages: PageBase[];
  #controlArea: ControlArea;
  #viewSettings: ViewSettings;

  #props: Props;
  #currentIndexChangedHandlers: CurrentIndexChangeHandler[] = [];
  #currentIndexes: number[] = [];
  #showSettings = false;
  #isSpreadStyle: boolean;

  #rootRef: JSX.RefElement;
  #mainRef: JSX.RefElement;
  #viewerPagesRef: JSX.RefElement;
  #pageStyleCheckerRef: JSX.RefElement;
  #closeButtonRef: JSX.RefElement;

  constructor(loadablePageContents: LoadablePageContent[], props: Props) {
    console.log('Main constructor');
    super();

    this.#props = props;

    let hideMainVisibleId: number | undefined;
    let autoFadeout = true;
    this.#isSpreadStyle = props.pageStyle === 'spread';

    const autoFadeoutCtrl = () => {
      if (!autoFadeout) return;
      window.clearTimeout(hideMainVisibleId);
      this.#controlArea.show();

      // controlShowTime0以下なら自動で非表示にしない
      if (this.#props.controlShowTime <= 0) {
        return;
      }

      // クリックして一定時間経過したらコントロール領域を消す
      hideMainVisibleId = window.setTimeout(() => {
        this.#controlArea.hide();
      }, this.#props.controlShowTime);
    };

    const disableAutoFadeout = () => {
      autoFadeout = false;

      window.clearTimeout(hideMainVisibleId);
      this.#controlArea.show();
    };

    const enableAutoFadeout = () => {
      autoFadeout = true;
      autoFadeoutCtrl();
    };

    this.#rootRef = this.createRef((el) => {
      el.style.setProperty('--default-width', `${this.#props.pageSize.width}`);
      el.style.setProperty(
        '--default-wide-width',
        `${this.#props.pageSize.width * 2}`
      );
      el.style.setProperty(
        '--default-height',
        `${this.#props.pageSize.height}`
      );
      // scrollDurationの設定（デフォルトは300ms）
      const scrollDuration = this.#props.scrollDuration ?? 300;
      el.style.setProperty('--scroll-duration', `${scrollDuration}ms`);

      el.addEventListener('click', autoFadeoutCtrl);
      enableAutoFadeout();
    });

    this.#mainRef = this.createRef();

    this.pages = loadablePageContents.map(
      (content, index) =>
        new Page(content, {
          index,
          size: this.#props.pageSize,
          onTapLeft: () => this.goLeft(),
          onTapRight: () => this.goRight(),
        })
    );

    this.#blankPage = new EmptyPage({
      index: this.pages.length,
      onTapLeft: () => this.goLeft(),
      onTapRight: () => this.goRight(),
    });

    // showLastPageがfalseの場合、またはlastPageElementがnullでshowLastPageがfalseの場合、最終ページを作成しない
    if (this.#props.showLastPage !== false) {
      this.#lastPage = new EmbedPage({
        index: this.pages.length + 1,
        element: this.#props.lastPageElement,
        onTapLeft: () => this.goLeft(),
        onTapRight: () => this.goRight(),
        onDispose: () => this.#props.onDispose(),
      });
    } else {
      this.#lastPage = null;
    }

    // 最終ページが存在する場合のみallPagesに追加
    this.#allPages = this.#lastPage 
      ? [...this.pages, this.#blankPage, this.#lastPage]
      : [...this.pages, this.#blankPage];

    this.#controlArea = new ControlArea({
      title: this.#props.title,
      pageLength: this.pages.length,
      direction: this.#props.direction,
      thumbnailElements: this.#allPages.map((p) => p.createThumbnailElement()),
      onOpenSettings: () => {
        disableAutoFadeout();
        this.#viewSettings.show({
          direction: this.direction,
          pageStyle: this.pageStyle,
        });
      },
      onClickLeft: () => this.goLeft(),
      onClickRight: () => this.goRight(),
      onThumbnailChanged: (index) => {
        autoFadeoutCtrl();
        const page = this.#allPages.find((p) => p.index === index);
        // 空ページ選択の場合は最後のページへ遷移
        const element =
          page === this.#blankPage
            ? this.#lastPage?.thumbnailElement
            : page?.thumbnailElement;
        element?.scrollIntoView();
      },
      onPageSelectorChanged: (index) => this.goTo(index),
    });
    this.#viewSettings = new ViewSettings({
      onSettingsChange: (settings) => {
        this.direction = settings.direction;
        this.pageStyle = settings.pageStyle;

        this.#reflectCurrentIndexes();
        enableAutoFadeout();
      },
    });

    this.#pageStyleCheckerRef = this.createRef((el) => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            // page-style-checkerが表示されている場合は見開き表示
            const isSpreadStyle = entry.isIntersecting;
            this.#isSpreadStyle = isSpreadStyle;
            this.#controlArea.updatePageSelector(isSpreadStyle);
          }
        },
        {
          root: this.#rootRef.current,
        }
      );
      observer.observe(el);
    });

    this.#closeButtonRef = this.createRef((el) => {
      el.addEventListener('click', () => {
        this.#props.onDispose();
      });
    });

    this.#viewerPagesRef = this.createRef((el) => {
      this.#setupCurrentIndexes(el, this.#allPages);
      el.addEventListener('click', (e) => {
        e.stopPropagation();

        if (this.#controlArea.visible) {
          window.clearTimeout(hideMainVisibleId);
          this.#controlArea.hide();
        } else {
          autoFadeoutCtrl();
        }
      });
    });
  }

  get pageStyle(): PageStyle {
    return this.#props.pageStyle;
  }

  set pageStyle(pageStyle: PageStyle) {
    const prev = this.#props.pageStyle;
    if (prev === pageStyle) {
      return;
    }
    this.#props.pageStyle = pageStyle;
    this.#updateRootClasses();
  }

  get direction(): ViewerDirection {
    return this.#props.direction;
  }

  set direction(direction: ViewerDirection) {
    const prev = this.#props.direction;
    if (prev === direction) {
      return;
    }
    this.#props.direction = direction;
    this.#controlArea.direction = direction;
    this.#updateRootClasses();
  }

  get scrollDuration(): number | undefined {
    return this.#props.scrollDuration;
  }

  set scrollDuration(duration: number | undefined) {
    this.#props.scrollDuration = duration;
  }

  openSettings() {
    if (!this.#showSettings) {
      return;
    }
    this.#showSettings = false;
  }

  closeSettings() {
    if (this.#showSettings) {
      return;
    }
    this.#showSettings = true;
  }

  #updateRootClasses() {
    const rootElm = this.#rootRef.current;
    if (!rootElm) {
      return;
    }
    rootElm.setAttribute('class', '');
    rootElm.classList.add(...this.#rootClasses());
  }

  #rootClasses() {
    const defaultRootClasses = [appName, `${appName}-root`];
    if (this.#props.direction.startsWith('horizontal-')) {
      defaultRootClasses.push('horizontal-viewer');
    }
    defaultRootClasses.push(this.#props.direction);
    defaultRootClasses.push(`page-style-${this.#props.pageStyle}`);
    if (this.#props.modal) {
      defaultRootClasses.push('modal-viewer');
    }
    return defaultRootClasses;
  }

  createElement() {
    const rootClasses = this.#rootClasses();

    return (
      <div classNames={rootClasses} ref={this.#rootRef}>
        <div classNames={['modal-bg', 'viewer-bg']} />
        <div ref={this.#mainRef} classNames={['viewer-main']}>
          <div ref={this.#viewerPagesRef} classNames={['viewer-pages']}>
            {this.#allPages.map((p) => p.createElement())}
          </div>
          {this.#controlArea.createElement()}
        </div>
        <button ref={this.#closeButtonRef} classNames={['viewer-close-button']}>
          {createFaIcon(faXmark)}
        </button>
        {this.#viewSettings.createElement()}
        <div
          classNames={['page-style-checker']}
          ref={this.#pageStyleCheckerRef}
        />
      </div>
    );
  }

  #setupCurrentIndexes(viewerPagesElm: HTMLElement, pages: PageBase[]) {
    const currentIndexes = new Set<number>();
    let pendingCurrentIndexes = false;
    let scrolling: number | undefined = undefined;

    viewerPagesElm.addEventListener('scroll', () => {
      scrolling != null && window.clearTimeout(scrolling);
      scrolling = window.setTimeout(() => {
        scrolling = undefined;
        if (pendingCurrentIndexes) {
          pendingCurrentIndexes = false;
          this.#emitCurrentIndexChanged([...currentIndexes]);
        }
      }, 100);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = pages.find((p) => p.element === entry.target);
          if (!page) {
            continue;
          }
          if (entry.isIntersecting) {
            currentIndexes.add(page.index);
          } else {
            currentIndexes.delete(page.index);
          }
          if (scrolling != null) {
            pendingCurrentIndexes = true;
          } else {
            pendingCurrentIndexes = false;
            this.#emitCurrentIndexChanged([...currentIndexes]);
          }
        }
      },
      {
        root: viewerPagesElm,
        threshold: 0.2,
      }
    );

    for (const page of pages) {
      page.setup((el) => {
        observer.observe(el);
      });
    }
  }

  get currentIndex(): number {
    if (this.#currentIndexes.length === 0) {
      return 0;
    }
    return Math.min(...this.#currentIndexes);
  }

  get isLastPage(): boolean {
    if (!this.#lastPage) return false;
    const page = this.#allPages.find((p) => p.index === this.currentIndex);
    return page?.element === this.#lastPage.element;
  }

  onCurrentIndexChanged(handler: CurrentIndexChangeHandler) {
    this.#currentIndexChangedHandlers.push(handler);
  }

  #emitCurrentIndexChanged(indexes: number[]) {
    this.#currentIndexes = indexes;
    this.#controlArea.currentIndex = this.currentIndex;
    this.#reflectCurrentIndexes();
    
    // autoCloseが有効で、最終ページに移動したら自動的にviewerを閉じる
    if (this.#props.autoClose && this.#lastPage && this.isLastPage) {
      // 少し遅延を入れてから閉じる（ユーザーが最終ページを確認できるように）
      setTimeout(() => {
        this.#props.onDispose();
      }, 1000);
    }
    
    for (const handler of this.#currentIndexChangedHandlers) {
      handler(this.currentIndex);
    }
  }

  #reflectCurrentIndexes() {
    if (this.#currentIndexes.includes(0)) {
      this.#rootRef.current?.classList.add(FIRST_PAGE_SHOWN);
    } else {
      this.#rootRef.current?.classList.remove(FIRST_PAGE_SHOWN);
    }
    // 最終ページが存在する場合のみ処理
    if (this.#lastPage && this.#currentIndexes.includes(this.#lastPage.index)) {
      this.#rootRef.current?.classList.add(LAST_PAGE_SHOWN);
    } else {
      this.#rootRef.current?.classList.remove(LAST_PAGE_SHOWN);
    }
  }

  goBack() {
    // 最後のページの場合はemptyを挟むので見開き表示でなくても2つ移動
    this.goTo(
      this.currentIndex - (this.#isSpreadStyle || this.isLastPage ? 2 : 1)
    );
  }

  goNext() {
    // 最終ページが表示されない場合の処理
    if (!this.#lastPage) {
      // 現在のページが最終ページ（空ページの前）の場合、viewを閉じる
      if (this.currentIndex >= this.pages.length - 1) {
        this.#props.onDispose();
        return;
      }
    }
    
    this.goTo(this.currentIndex + (this.#isSpreadStyle ? 2 : 1));
  }

  goLeft() {
    this.#props.direction === 'horizontal-rtl' ? this.goNext() : this.goBack();
  }

  goRight() {
    this.#props.direction === 'horizontal-rtl' ? this.goBack() : this.goNext();
  }

  goTo(index: number) {
    // 最終ページが表示されない場合の処理
    if (!this.#lastPage) {
      // 指定されたインデックスがページ数を超える場合、viewを閉じる
      if (index >= this.pages.length) {
        this.#props.onDispose();
        return;
      }
    }

    const page = this.#allPages.find((p) => p.index === index);
    // 空ページ選択の場合は最後のページへ遷移（最終ページが存在する場合のみ）
    const element =
      page === this.#blankPage && this.#lastPage
        ? this.#lastPage.element 
        : page?.element;
    
    if (!element) return;
    
    // スクロールアニメーションの時間を取得（デフォルトは300ms）
    const scrollDuration = this.#props.scrollDuration ?? 300;
    
    // カスタムスクロールアニメーション
    this.#smoothScrollTo(element, scrollDuration);
  }

  #smoothScrollTo(targetElement: HTMLElement, duration: number) {
    const viewerPagesElm = this.#viewerPagesRef.current;
    if (!viewerPagesElm) return;

    const startPosition = viewerPagesElm.scrollLeft;
    const targetPosition = targetElement.offsetLeft - viewerPagesElm.offsetLeft;
    const distance = targetPosition - startPosition;
    const startTime = performance.now();

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // イージング関数（ease-in-out）
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      const currentPosition = startPosition + distance * easeProgress;
      viewerPagesElm.scrollLeft = currentPosition;

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  }
}
