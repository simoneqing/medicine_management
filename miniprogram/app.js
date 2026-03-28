App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用支持云开发的基础库版本');
      return;
    }

    wx.cloud.init({
      traceUser: true
    });
  }
});
