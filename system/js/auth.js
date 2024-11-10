// 验证用户是否已登录
function checkAuth() {
    const token = localStorage.getItem('token');
    const currentPath = window.location.pathname;
    
    // 只允许访问登录页和主页
    const allowedPaths = ['/system/login.html', '/system/index.html'];
    
    // 如果不是允许的路径，重定向到首页
    if (!allowedPaths.includes(currentPath)) {
        window.location.href = '/system/index.html';
        return;
    }
    
    // 如果是登录页面，已有token则直接跳转到首页
    if (currentPath.includes('login.html') && token) {
        window.location.href = '/system/views/index.html';
        return;
    }
    
    // 如果不是登录页面且没有token，则重定向到登录页
    if (!token && !currentPath.includes('login.html')) {
        // 保存当前URL，用于登录后重定向
        localStorage.setItem('redirectUrl', currentPath);
        window.location.href = '/system/views/login.html';
        return;
    }
}

// 处理登出
function handleLogout() {
    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 清除本地存储的认证信息
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            // 重定向到登录页
            window.location.href = '/system/views/login.html';
        });
    }
}

// 更新用户信息显示
function updateUserInfo() {
    const usernameElement = document.getElementById('username');
    if (usernameElement) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        usernameElement.textContent = user.username || '管理员';
    }
}

// 页面加载时执行认证检查
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    handleLogout();
    updateUserInfo();
});

// 导出认证相关函数供其他模块使用
window.Auth = {
    checkAuth,
    handleLogout,
    updateUserInfo
}; 