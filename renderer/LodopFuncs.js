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
    console.log('[C-Lodop] 用户代理:', ua);
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

// 获取C-Lodop客户端 - 修改为异步版本
function getCLodopClient() {
  console.log('[C-Lodop] 开始获取客户端，当前状态:', CLodopJsState);

  if (CLodopJsState == 'loading') {
    console.log('[C-Lodop] 正在加载中，等待完成...');
    return null;
  }
  if (CLodopJsState == 'complete') {
    console.log('[C-Lodop] 已完成加载，返回现有对象');
    return CreatedOKLodopObject;
  }

  CLodopJsState = 'loading';

  try {
    // 尝试连接本地C-Lodop服务
    var ports = [8000, 18000]; // C-Lodop默认端口
    console.log('[C-Lodop] 尝试连接端口:', ports);

    for (var i = 0; i < ports.length; i++) {
      try {
        console.log('[C-Lodop] 尝试端口:', ports[i]);
        var xhr = new XMLHttpRequest();
        xhr.open(
          'GET',
          'http://localhost:' + ports[i] + '/CLodopfuncs.js',
          false
        );
        xhr.send();

        console.log('[C-Lodop] 端口', ports[i], '响应状态:', xhr.status);

        if (xhr.status === 200) {
          console.log(
            '[C-Lodop] 端口',
            ports[i],
            '连接成功，响应长度:',
            xhr.responseText.length
          );

          // 执行返回的JavaScript代码
          eval(xhr.responseText);

          if (typeof getLodop !== 'undefined') {
            console.log('[C-Lodop] getLodop函数已定义');
            CreatedOKLodopObject = getLodop();
            if (CreatedOKLodopObject && CreatedOKLodopObject.VERSION) {
              CLodopJsState = 'complete';
              console.log(
                '[C-Lodop] 通过端口',
                ports[i],
                '连接成功，版本:',
                CreatedOKLodopObject.VERSION
              );

              // 测试打印机数量
              try {
                var printerCount = CreatedOKLodopObject.GET_PRINTER_COUNT();
                console.log('[C-Lodop] 检测到打印机数量:', printerCount);

                for (var j = 0; j < printerCount; j++) {
                  var printerName = CreatedOKLodopObject.GET_PRINTER_NAME(j);
                  console.log('[C-Lodop] 打印机', j, ':', printerName);
                }
              } catch (printerErr) {
                console.error('[C-Lodop] 获取打印机信息失败:', printerErr);
              }

              return CreatedOKLodopObject;
            } else {
              console.error(
                '[C-Lodop] getLodop()返回无效对象:',
                CreatedOKLodopObject
              );
            }
          } else {
            console.error('[C-Lodop] 执行JS后未找到getLodop函数');
          }
        } else {
          console.warn('[C-Lodop] 端口', ports[i], 'HTTP错误:', xhr.status);
        }
      } catch (err) {
        console.warn('[C-Lodop] 端口', ports[i], '连接异常:', err);
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

// 主要的getLodop函数
function getLodop() {
  console.log('[C-Lodop] getLodop()被调用');
  var LODOP = getCLodop();

  if (!LODOP) {
    console.error('[C-Lodop] 获取C-Lodop对象失败');
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
  console.log('[C-Lodop] 检查C-Lodop状态...');
  var LODOP = getLodop();

  if (LODOP) {
    try {
      var printerCount = LODOP.GET_PRINTER_COUNT
        ? LODOP.GET_PRINTER_COUNT()
        : 0;
      console.log('[C-Lodop] 状态检查完成，打印机数量:', printerCount);

      return {
        available: true,
        version: LODOP.VERSION,
        isLocal: CLodopIsLocal || false,
        printerCount: printerCount,
      };
    } catch (err) {
      console.error('[C-Lodop] 状态检查失败:', err);
      return {
        available: false,
        version: LODOP.VERSION,
        isLocal: false,
        printerCount: 0,
        error: err.message,
      };
    }
  } else {
    console.log('[C-Lodop] LODOP对象不可用');
    return {
      available: false,
      version: null,
      isLocal: false,
      printerCount: 0,
    };
  }
}

// 增强的获取C-Lodop函数，优先使用连接管理器
function getReliableCLodop() {
  // 如果有连接管理器，优先使用
  if (typeof window !== 'undefined' && window.ensureCLodopConnection) {
    console.log('[C-Lodop] 使用连接管理器获取C-Lodop...');
    return window.ensureCLodopConnection();
  }

  // 否则使用传统方法
  const lodop = getLodop();
  return Promise.resolve(
    lodop
      ? { success: true, lodop: lodop }
      : { success: false, error: 'C-Lodop不可用' }
  );
}

// C-Lodop 安装提示函数
function installCLodop() {
  console.log('[C-Lodop] 显示安装提示');

  // 创建简单的提示信息
  const message = `
检测到C-Lodop打印控件未安装或无法连接。

解决方案：
1. 确认已安装C-Lodop软件
2. 检查C-Lodop服务是否正在运行
3. 确认防火墙允许C-Lodop通信
4. 尝试重启C-Lodop服务
5. 如果问题持续，请重新安装C-Lodop

请访问 http://www.lodop.net 下载最新版本。
  `.trim();

  // 显示提示
  if (typeof alert !== 'undefined') {
    alert(message);
  } else {
    console.error('[C-Lodop] ' + message);
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.getLodop = getLodop;
  window.getCLodop = getCLodop;
  window.checkCLodopStatus = checkCLodopStatus;
  window.getReliableCLodop = getReliableCLodop;
  window.installCLodop = installCLodop;

  console.log('[C-Lodop] 函数已加载到全局作用域');
}

// 如果是Node.js环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getLodop: getLodop,
    getCLodop: getCLodop,
    checkCLodopStatus: checkCLodopStatus,
  };
}
