// モジュールレベル（関数の外側）でキャッシュ変数を定義
let cachedMobileResult: boolean | null = null;
let cachedInnerWidth: number | null = null;

/**
 * デバイスがスマホかどうかを判定する
 * @returns スマホの場合はtrue、それ以外はfalse
 */
export function isMobileDevice(): boolean {
  if (cachedMobileResult !== null) {
    return cachedMobileResult;
  }
  
  // 初回のみ判定を実行
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /iphone|android.*mobile|webos|blackberry|iemobile|opera mini/i.test(userAgent);
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // 初期化時の画面幅を記録
  if (cachedInnerWidth === null) {
    cachedInnerWidth = window.innerWidth;
  }
  
  const isSmallScreen = cachedInnerWidth <= 480;
  const ret = isMobile && (hasTouchScreen && isSmallScreen);
  
  // キャッシュに結果を保存
  cachedMobileResult = ret;
  
  // alert('isMobileDevice:' + (ret ? 'true' : 'false') + ' isMobile:' + isMobile + ' hasTouchScreen:' + hasTouchScreen + ' isSmallScreen:' + isSmallScreen + 'windows.innerWidth:' + window.innerWidth + ' cachedInnerWidth:' + cachedInnerWidth);
  
  return ret;
}

/**
 * デバイスがタブレットかどうかを判定する
 * @returns タブレットの場合はtrue、それ以外はfalse
 */
export function isTabletDevice(): boolean {
  // User Agentによる判定（iPadを含む）
  const userAgent = navigator.userAgent.toLowerCase();
  const isTablet = /ipad|tablet|android(?!.*mobile)/i.test(userAgent);
  
  // タッチデバイスかつタブレットサイズ（480px超え～1024px以下）
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // キャッシュされた初期幅を使用（まだ設定されていない場合は現在の値）
  const screenWidth = cachedInnerWidth ?? window.innerWidth;
  const isTabletSize = screenWidth > 480 && screenWidth <= 1024;
  
  return isTablet || (hasTouchScreen && isTabletSize);
}

/**
 * Canvas描画で使用すべきDPRを取得する
 * @returns 適切なDPR値
 */
export function getCanvasDPR(): number {
  const actualDPR = window.devicePixelRatio || 1;
  
  // スマホの場合：DPR処理を無効化（既存のCSS image-rendering設定を活用）
  if (isMobileDevice()) {
    return 1;
  }
  
  // タブレットの場合：DPRを適用（ただし上限を2に制限）
  if (isTabletDevice()) {
    return Math.min(actualDPR, 2);
  }
  
  // PC/デスクトップの場合：通常のDPR値を使用
  return actualDPR;
} 