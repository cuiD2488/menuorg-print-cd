// WebSocket自动打印测试脚本
// 这个脚本用于测试修改后的WebSocket自动打印功能

console.log('=== WebSocket自动打印功能测试 ===');

// 测试函数1: 模拟WebSocket接收订单消息
function simulateWebSocketOrderMessage() {
  console.log('\n1. 模拟WebSocket接收订单消息...');

  // 模拟服务器发送的消息格式
  const mockOrderMessage = {
    type: 'order',
    data: {
      order_id: '23410121750486179',
    },
  };

  console.log('模拟消息:', mockOrderMessage);

  // 检查WebSocket客户端是否存在
  if (window.app && window.app.wsClient) {
    console.log('WebSocket客户端存在，触发消息处理...');

    // 模拟接收消息
    window.app.wsClient.emit('newOrder', mockOrderMessage.data);
    console.log('✅ 已触发newOrder事件');
  } else {
    console.error('❌ WebSocket客户端不存在或应用未初始化');
  }
}

// 测试函数2: 检查自动打印条件
function checkAutoPrintConditions() {
  console.log('\n2. 检查自动打印条件...');

  // 检查登录状态
  const isLoggedIn = window.app && window.app.currentUser;
  console.log('登录状态:', isLoggedIn ? '✅ 已登录' : '❌ 未登录');

  // 检查自动打印设置
  const autoPrintEnabled = document.getElementById('autoPrint')?.checked;
  console.log('自动打印设置:', autoPrintEnabled ? '✅ 已启用' : '❌ 未启用');

  // 检查选中的打印机
  const selectedPrinters =
    window.app?.printerManager?.getSelectedPrinters() || [];
  console.log(
    '选中的打印机:',
    selectedPrinters.length > 0 ? `✅ ${selectedPrinters.length}台` : '❌ 无'
  );
  if (selectedPrinters.length > 0) {
    console.log('打印机列表:', selectedPrinters);
  }

  // 检查WebSocket连接
  const wsConnected = window.app?.wsClient?.isConnected();
  console.log('WebSocket连接:', wsConnected ? '✅ 已连接' : '❌ 未连接');

  return {
    isLoggedIn,
    autoPrintEnabled,
    hasPrinters: selectedPrinters.length > 0,
    wsConnected,
  };
}

// 测试函数3: 直接测试handleNewOrder方法
async function testHandleNewOrderDirectly() {
  console.log('\n3. 直接测试handleNewOrder方法...');

  if (!window.app) {
    console.error('❌ 应用未初始化');
    return;
  }

  const testOrderData = {
    order_id: 'TEST_ORDER_123',
    id: 'TEST_ORDER_123',
  };

  try {
    console.log('调用handleNewOrder方法，测试数据:', testOrderData);
    await window.app.handleNewOrder(testOrderData);
    console.log('✅ handleNewOrder方法执行完成');
  } catch (error) {
    console.error('❌ handleNewOrder执行失败:', error);
  }
}

// 测试函数4: 完整流程测试
async function fullWebSocketAutoPrintTest() {
  console.log('\n4. 完整WebSocket自动打印流程测试...');

  // 检查条件
  const conditions = checkAutoPrintConditions();

  if (!conditions.isLoggedIn) {
    console.error('❌ 请先登录');
    return;
  }

  if (!conditions.autoPrintEnabled) {
    console.warn('⚠️ 自动打印未启用，正在启用...');
    document.getElementById('autoPrint').checked = true;
  }

  if (!conditions.hasPrinters) {
    console.warn('⚠️ 未选择打印机，测试将显示相应提示');
  }

  if (!conditions.wsConnected) {
    console.warn('⚠️ WebSocket未连接，但仍可测试handleNewOrder逻辑');
  }

  // 执行测试
  console.log('开始完整流程测试...');
  await testHandleNewOrderDirectly();
}

// 测试函数5: 监控WebSocket消息
function startWebSocketMessageMonitoring() {
  console.log('\n5. 开始监控WebSocket消息...');

  if (!window.app?.wsClient) {
    console.error('❌ WebSocket客户端不存在');
    return;
  }

  // 添加消息监听器
  window.app.wsClient.on('newOrder', (data) => {
    console.log('🔔 [监控] 收到newOrder事件:', data);
  });

  window.app.wsClient.on('message', (data) => {
    console.log('📨 [监控] 收到message事件:', data);
  });

  console.log('✅ WebSocket消息监控已启动');
  console.log('提示: 现在可以通过外部方式发送WebSocket消息进行测试');
}

// 导出测试函数到全局作用域
window.testWebSocketAutoPrint = {
  simulateMessage: simulateWebSocketOrderMessage,
  checkConditions: checkAutoPrintConditions,
  testHandleNewOrder: testHandleNewOrderDirectly,
  fullTest: fullWebSocketAutoPrintTest,
  startMonitoring: startWebSocketMessageMonitoring,
};

console.log('\n=== 测试函数已准备就绪 ===');
console.log('可用的测试函数:');
console.log('1. testWebSocketAutoPrint.checkConditions() - 检查自动打印条件');
console.log(
  '2. testWebSocketAutoPrint.testHandleNewOrder() - 直接测试处理方法'
);
console.log('3. testWebSocketAutoPrint.fullTest() - 完整流程测试');
console.log('4. testWebSocketAutoPrint.simulateMessage() - 模拟WebSocket消息');
console.log('5. testWebSocketAutoPrint.startMonitoring() - 开始消息监控');
console.log('\n建议先运行: testWebSocketAutoPrint.checkConditions()');
