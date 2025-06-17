class API {
  static baseURL = 'https://api.menuorg.com/app/v1';

  static async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // 如果 options 中没有 Authorization 头，但 localStorage 中有 token，则自动添加
    if (!config.headers.Authorization) {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = token; // 直接使用 token，不加 Bearer 前缀
      }
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }

  static async login(username, password) {
    try {
      console.log('[API] Starting login process for user:', username);

      // 对密码进行base64编码
      const encodedPassword = btoa(password);
      console.log('[API] Password encoded to base64');

      const response = await this.request('/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password: encodedPassword,
          login_method: 'password',
          login_type: 'platform',
          terminal: 1,
        }),
      });

      console.log('[API] Login response received:', response);

      // 更灵活的响应处理 - 检查多种可能的成功标识
      const isSuccess =
        response.code === 0 ||
        response.code === 200 ||
        response.success === true ||
        response.status === 'success' ||
        (response.data && (response.data.token || response.data.user_id));

      console.log('[API] Login success check result:', isSuccess);

      if (isSuccess) {
        const loginData = response.data || response.result || response;
        console.log('[API] Login successful, user data:', loginData);

        // 保存用户信息到localStorage以供订单列表使用
        if (loginData.user_id) {
          localStorage.setItem('userId', loginData.user_id);
        }
        if (loginData.rd_id) {
          localStorage.setItem('rdId', loginData.rd_id.toString());
        }
        if (loginData.token) {
          localStorage.setItem('authToken', loginData.token);
        }

        return {
          success: true,
          data: loginData,
          message: response.message || 'Login successful',
        };
      } else {
        console.warn('[API] Login failed, response:', response);
        return {
          success: false,
          message: response.message || response.msg || 'Login failed',
        };
      }
    } catch (error) {
      console.error('[API] Login error:', error);
      return {
        success: false,
        message: error.message || 'Network error',
      };
    }
  }

  static async getOrderById(orderId) {
    try {
      const userId = localStorage.getItem('userId');
      const token = localStorage.getItem('authToken');

      if (!userId || !token) {
        throw new Error('用户未登录或缺少必要参数');
      }

      console.log('[API] Getting order details for order ID:', orderId);

      const response = await this.request(
        `/order/get_by_id?user_id=${userId}&order_id=${orderId}`
      );

      console.log('[API] Order details response:', response);

      if (response.code === 0 || response.success) {
        return {
          success: true,
          data: response.data || response.result,
        };
      } else {
        return {
          success: false,
          message: response.message || '获取订单失败',
        };
      }
    } catch (error) {
      console.error('[API] Get order by ID error:', error);
      return {
        success: false,
        message: error.message || '网络错误',
      };
    }
  }

  static async getOrderList(page = 1, perPage = 10) {
    try {
      const userId = localStorage.getItem('userId');
      const rdId = localStorage.getItem('rdId');
      const token = localStorage.getItem('authToken');

      console.log('[API] Checking authentication data:', {
        userId: userId,
        rdId: rdId,
        token: token ? 'present' : 'missing',
        hasUserId: !!userId,
        hasRdId: !!rdId,
        hasToken: !!token,
      });

      if (!userId || !rdId || !token) {
        const missingParams = [];
        if (!userId) missingParams.push('userId');
        if (!rdId) missingParams.push('rdId');
        if (!token) missingParams.push('token');

        const errorMsg = `用户未登录或缺少必要参数: ${missingParams.join(
          ', '
        )}`;
        console.error('[API] Missing authentication parameters:', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('[API] Getting order list with params:', {
        userId,
        rdId,
        page,
        perPage,
      });

      const response = await this.request(
        `/order/get_by_rd_two?user_id=${userId}&rd_id=${rdId}&page=${page}&per_page=${perPage}`
      );

      console.log('[API] Order list response:', response);

      // 根据实际返回的数据结构进行解析
      if (
        response.status_code === 200 ||
        response.code === 0 ||
        response.success
      ) {
        const responseData = response.data || {};
        const orders = responseData.items || responseData.data || [];

        console.log('[API] Parsed orders:', orders);

        return {
          success: true,
          data: Array.isArray(orders) ? orders : [],
          total: responseData.total || orders.length,
          page: responseData.page || page,
          perPage: responseData.per_page || perPage,
          pages: responseData.pages || 1,
        };
      } else {
        return {
          success: false,
          message: response.message || '获取订单列表失败',
          data: [],
        };
      }
    } catch (error) {
      console.error('[API] Get order list error:', error);
      return {
        success: false,
        message: error.message || '网络错误',
        data: [],
      };
    }
  }

  // 保留原有的getRecentOrders方法以兼容现有代码
  static async getRecentOrders(limit = 10) {
    console.log('[API] getRecentOrders called, redirecting to getOrderList');
    return this.getOrderList(1, limit);
  }

  static async getUserInfo() {
    try {
      const response = await this.request('/user/info');

      if (response.code === 0 || response.success) {
        return {
          success: true,
          data: response.data || response.result,
        };
      } else {
        return {
          success: false,
          message: response.message || '获取用户信息失败',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message || '网络错误',
      };
    }
  }
}
