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

    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
        body: JSON.stringify({ username, password: encodedPassword }),
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
      const response = await this.request(
        `/order/get_by_id?order_id=${orderId}`
      );

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
      return {
        success: false,
        message: error.message || '网络错误',
      };
    }
  }

  static async getRecentOrders(limit = 10) {
    try {
      const response = await this.request(`/orders/recent?limit=${limit}`);

      if (response.code === 0 || response.success) {
        return {
          success: true,
          data: response.data || response.result || [],
        };
      } else {
        return {
          success: false,
          message: response.message || '获取订单列表失败',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message || '网络错误',
      };
    }
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
