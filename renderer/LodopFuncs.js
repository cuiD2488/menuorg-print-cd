// C-Lodop 函数文件
// 用于兼容 Windows 7 系统的C-Lodop打印控件

var CreatedOKLodopObject, CLodopIsLocal, CLodopJsState;

// 检查C-Lodop是否已安装
function getCLodop() {
  var LODOP;
  try {
    var isIE =
      navigator.userAgent.indexOf('MSIE') >= 0 ||
      navigator.userAgent.indexOf('Trident') >= 0;

    if (needCLodop()) {
      try {
        LODOP = getCLodopClient();
        if (LODOP && LODOP.VERSION) {
          if (LODOP.CVERSION) {
            CLodopIsLocal = true;
          }
          console.log('[C-Lodop] 客户端版本:', LODOP.VERSION);
          return LODOP;
        }
      } catch (err) {
        console.warn('[C-Lodop] 获取客户端失败:', err);
      }
    }

    // 如果客户端不可用，尝试使用ActiveX
    if (isIE) {
      try {
        LODOP = new ActiveXObject('Lodop.LodopCtrl.1');
        console.log('[C-Lodop] ActiveX版本:', LODOP.VERSION);
        return LODOP;
      } catch (err) {
        console.warn('[C-Lodop] ActiveX创建失败:', err);
      }
    }

    // 如果都不可用，返回null
    console.error('[C-Lodop] 未找到可用的C-Lodop控件');
    return null;
  } catch (err) {
    console.error('[C-Lodop] 获取C-Lodop对象失败:', err);
    return null;
  }
}

// 检查是否需要C-Lodop
function needCLodop() {
  try {
    var ua = navigator.userAgent;
    if (ua.match(/Windows\sNT\s6\.1/i) != null) return true; // Windows 7
    if (ua.match(/Windows\sNT\s6\.0/i) != null) return true; // Windows Vista
    if (ua.match(/Windows\sNT\s5/i) != null) return true; // Windows XP/2003
    if (ua.match(/Linux/i) != null) return true;
    if (ua.match(/iPhone|iPad/i) != null) return true;
    if (ua.match(/Android/i) != null) return true;
    if (ua.match(/Edge/i) != null) return true;
    if (ua.match(/Chrome/i) != null) return true;
    if (ua.match(/Firefox/i) != null) return true;
    return false;
  } catch (err) {
    return true;
  }
}

// 获取C-Lodop客户端
function getCLodopClient() {
  if (CLodopJsState == 'loading') return;
  if (CLodopJsState == 'complete') return CreatedOKLodopObject;

  CLodopJsState = 'loading';

  try {
    // 尝试连接本地C-Lodop服务
    var ports = [8000, 18000]; // C-Lodop默认端口

    for (var i = 0; i < ports.length; i++) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open(
          'GET',
          'http://localhost:' + ports[i] + '/CLodopfuncs.js',
          false
        );
        xhr.send();

        if (xhr.status === 200) {
          // 执行返回的JavaScript代码
          eval(xhr.responseText);

          if (typeof getLodop !== 'undefined') {
            CreatedOKLodopObject = getLodop();
            if (CreatedOKLodopObject && CreatedOKLodopObject.VERSION) {
              CLodopJsState = 'complete';
              console.log('[C-Lodop] 通过端口', ports[i], '连接成功');
              return CreatedOKLodopObject;
            }
          }
        }
      } catch (err) {
        console.warn('[C-Lodop] 端口', ports[i], '连接失败:', err);
        continue;
      }
    }

    console.error('[C-Lodop] 所有端口连接失败');
    CLodopJsState = 'failed';
    return null;
  } catch (err) {
    console.error('[C-Lodop] 获取客户端异常:', err);
    CLodopJsState = 'failed';
    return null;
  }
}

// 安装C-Lodop提示
function installCLodop() {
  console.log('[C-Lodop] 开始安装提示...');

  var tip = '本应用需要安装C-Lodop打印控件才能正常打印。\n\n';
  tip += '您可以从以下地址下载安装：\n';
  tip += 'http://www.lodop.net/download.html\n\n';
  tip += '安装完成后请重新启动应用程序。';

  alert(tip);

  // 尝试打开下载页面
  try {
    if (typeof require !== 'undefined') {
      const { shell } = require('electron');
      shell.openExternal('http://www.lodop.net/download.html');
    } else {
      window.open('http://www.lodop.net/download.html', '_blank');
    }
  } catch (err) {
    console.warn('[C-Lodop] 无法自动打开下载页面:', err);
  }
}

// 主要的getLodop函数
function getLodop() {
  var LODOP = getCLodop();

  if (!LODOP) {
    console.error('[C-Lodop] 获取C-Lodop对象失败');

    // 显示安装提示
    setTimeout(function () {
      if (
        confirm('检测到您的系统需要安装C-Lodop打印控件。\n是否现在下载安装？')
      ) {
        installCLodop();
      }
    }, 100);

    return null;
  }

  // 验证C-Lodop功能
  try {
    var version = LODOP.VERSION;
    if (!version) {
      throw new Error('无法获取C-Lodop版本信息');
    }

    console.log('[C-Lodop] 初始化成功，版本:', version);

    // 设置一些默认属性
    if (LODOP.SET_LICENSES) {
      // 如果有许可证，在这里设置
      // LODOP.SET_LICENSES("", "", "", "");
    }

    return LODOP;
  } catch (err) {
    console.error('[C-Lodop] 验证C-Lodop功能失败:', err);
    return null;
  }
}

// 检查C-Lodop状态
function checkCLodopStatus() {
  var LODOP = getLodop();

  if (LODOP) {
    return {
      available: true,
      version: LODOP.VERSION,
      isLocal: CLodopIsLocal || false,
      printerCount: LODOP.GET_PRINTER_COUNT ? LODOP.GET_PRINTER_COUNT() : 0,
    };
  } else {
    return {
      available: false,
      version: null,
      isLocal: false,
      printerCount: 0,
    };
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.getLodop = getLodop;
  window.getCLodop = getCLodop;
  window.checkCLodopStatus = checkCLodopStatus;
  window.installCLodop = installCLodop;

  console.log('[C-Lodop] 函数已加载到全局作用域');
}

// 如果是Node.js环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getLodop: getLodop,
    getCLodop: getCLodop,
    checkCLodopStatus: checkCLodopStatus,
    installCLodop: installCLodop,
  };
}
