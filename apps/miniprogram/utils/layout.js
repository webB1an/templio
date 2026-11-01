/**
 * 自定义导航栏尺寸计算：适配刘海屏 + 右上角胶囊按钮。
 */
function getNavMetrics() {
  let system = {};
  try {
    system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  } catch (error) {
    system = {};
  }

  const statusBarHeight = system.statusBarHeight || 20;
  let menu = {
    top: statusBarHeight + 6,
    height: 32,
    left: (system.windowWidth || 375) - 100
  };
  try {
    const rect = wx.getMenuButtonBoundingClientRect();
    if (rect && rect.height) menu = rect;
  } catch (error) {
    // DevTools / 低版本可能拿不到胶囊位置，使用默认值
  }

  const navHeight = (menu.top - statusBarHeight) * 2 + menu.height;
  const windowWidth = system.windowWidth || 375;

  return {
    statusBarHeight,
    navHeight,
    capsuleHeight: menu.height,
    // 右侧需要给胶囊让出的宽度
    menuRight: windowWidth - menu.left,
    windowWidth
  };
}

module.exports = { getNavMetrics };
