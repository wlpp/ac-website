// Cookie 操作工具函数
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/`;
}

// 生成随机数字（1-10）
function getRandomNumber() {
    return Math.floor(Math.random() * 10) + 1;
}

// 生成验证问题
function generateCaptcha() {
    const num1 = getRandomNumber();
    const num2 = getRandomNumber();
    const answer = num1 + num2;
    return {
        question: `${num1} + ${num2} = ?`,
        answer: answer
    };
}

// 初始化验证问题
let currentCaptcha = generateCaptcha();

// 验证邮箱格式
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return '请输入有效的邮箱地址';
    }
    return '';
}

// 验证密码（移到全局作用域）
function validatePassword(password) {
    if (password.length < 6) {
        return '密码长度必须大于6位';
    }
    if (/[\u4e00-\u9fa5]/.test(password)) {
        return '密码不能包含中文字符';
    }
    return '';
}

// 通用功能函数
function togglePasswordVisibility(passwordField, icon) {
    if (passwordField.type === 'password') {
        passwordField.type = 'text';
        icon.classList.remove('fa-lock');
        icon.classList.add('fa-lock-open');
    } else {
        passwordField.type = 'password';
        icon.classList.remove('fa-lock-open');
        icon.classList.add('fa-lock');
    }
}

// 设置密码显示/隐藏功能
function setupPasswordToggle(container) {
    const passwordFields = container.querySelectorAll('input[type="password"]');
    const passwordIcons = container.querySelectorAll('.fa-lock');

    passwordIcons.forEach((icon, index) => {
        if (index < passwordFields.length) {
            icon.style.cursor = 'pointer';
            icon.addEventListener('click', () => togglePasswordVisibility(passwordFields[index], icon));
            icon.setAttribute('title', '点击显示/隐藏密码');
        }
    });
}

// 处理登录表单
function handleLoginForm() {
    const loginForm = document.querySelector('.login-form');
    if (!loginForm) return;

    const usernameInput = loginForm.querySelector('input[placeholder="用户名/邮箱"]');
    const passwordField = loginForm.querySelector('input[type="password"]');
    const passwordIcon = loginForm.querySelector('.fa-lock');
    const rememberMe = loginForm.querySelector('#remember');

    // 页面加载时检查是否有保存的用户名（从 localStorage 获取）
    const savedUsername = localStorage.getItem('savedUsername');
    if (savedUsername && usernameInput) {
        usernameInput.value = savedUsername;
        if (rememberMe) {
            rememberMe.checked = true;
        }
    }

    // 密码显示/隐藏功能
    if (passwordField && passwordIcon) {
        passwordIcon.style.cursor = 'pointer';
        passwordIcon.addEventListener('click', function() {
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                passwordIcon.classList.remove('fa-lock');
                passwordIcon.classList.add('fa-lock-open');
            } else {
                passwordField.type = 'password';
                passwordIcon.classList.remove('fa-lock-open');
                passwordIcon.classList.add('fa-lock');
            }
        });
    }

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!usernameInput || !passwordField) {
            message.error('表单元素未找到');
            return;
        }

        const username = usernameInput.value;
        const password = passwordField.value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                // 处理"记住我"功能
                if (rememberMe && rememberMe.checked) {
                    // 将用户名保存到 localStorage
                    localStorage.setItem('savedUsername', username);
                } else {
                    // 如果未勾选"记住我"，则删除已保存的用户名
                    localStorage.removeItem('savedUsername');
                }

                // 将用户数据合并为一个对象并加密存储
                const userData = {
                    username: data.username,
                    token: data.token,
                    user_id: data.id
                };
                setUserCookie(userData, 3); // 3天过期
                
                message.success('登录成功！');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
            } else {
                message.error(data.message || '登录失败，请稍后重试');
            }
        } catch (error) {
            debug.error('登录请求失败:', error);
            message.error('登录失败，请稍后重试');
        }
    });
}

// 修改用户界面更新函数
function updateUserInterface(userData) {
    const userContainer = document.querySelector('.user-container');
    if (!userContainer) {
        console.warn('未找到用户容器元素');
        return;
    }

    // 清空现有内容
    userContainer.innerHTML = '';
    
    if (userData && userData.username) {
        // 创建用户名显示元素
        const usernameSpan = document.createElement('span');
        usernameSpan.textContent = userData.username;
        usernameSpan.className = 'username';
        
        // 创建下拉菜单容器
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        dropdownMenu.style.display = 'none'; // 初始状态隐藏
        
        // 创建退出按钮
        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.className = 'dropdown-item';
        logoutLink.textContent = '退出';
        logoutLink.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            // 只清除用户认证相关的 cookie
            document.cookie = 'userData=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
            // 不删本地存储的用户名，这样下次登录还能使用
            // localStorage.removeItem('savedUsername'); // 注释掉这行
            // 刷新页面
            window.location.reload();
        };
        
        // 组装界面
        dropdownMenu.appendChild(logoutLink);
        userContainer.appendChild(usernameSpan);
        userContainer.appendChild(dropdownMenu);
        
        // 添加用户名击事件（显示/隐藏下拉菜单）
        usernameSpan.onclick = function(e) {
            e.stopPropagation();
            const isVisible = dropdownMenu.style.display === 'block';
            dropdownMenu.style.display = isVisible ? 'none' : 'block';
        };
        
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', function() {
            dropdownMenu.style.display = 'none';
        });
    } else {
        // 未登录状态的界面
        const loginLink = document.createElement('a');
        loginLink.href = '/login';
        loginLink.className = 'nav-link';
        loginLink.innerHTML = '<i class="fas fa-user"></i>';
        userContainer.appendChild(loginLink);
    }
}

// 修改检查用户状态函数
function checkUserStatus() {
    const userData = getUserCookie();
    if (userData) {
        debug.log('检测到用户数据:', userData);
        updateUserInterface(userData);
    } else {
        debug.log('未检测到用户数据');
    }
}

// 处理注册表单
function handleRegisterForm() {
    const registerForm = document.querySelector('.register-form');
    if (!registerForm) return;

    // 创建并插入验证问题输入框
    const captchaGroup = document.createElement('div');
    captchaGroup.className = 'form-group';
    captchaGroup.innerHTML = `
        <input type="text" placeholder="${currentCaptcha.question}" required>
        <i class="fa-solid fa-calculator"></i>
    `;
    
    // 将验证问题插入到表单中（在提交按钮之前）
    const submitBtn = registerForm.querySelector('.register-btn');
    if (submitBtn) {
        registerForm.insertBefore(captchaGroup, submitBtn);
    }
    
    // 添加密码显示/隐藏功能
    const passwordFields = registerForm.querySelectorAll('input[type="password"]');
    const passwordIcons = registerForm.querySelectorAll('.fa-lock');

    passwordIcons.forEach((icon, index) => {
        if (index < passwordFields.length) {
            icon.style.cursor = 'pointer';
            icon.addEventListener('click', function() {
                const passwordField = passwordFields[index];
                if (passwordField.type === 'password') {
                    passwordField.type = 'text';
                    icon.classList.remove('fa-lock');
                    icon.classList.add('fa-lock-open');
                } else {
                    passwordField.type = 'password';
                    icon.classList.remove('fa-lock-open');
                    icon.classList.add('fa-lock');
                }
            });
            icon.setAttribute('title', '点击显示/隐藏密码');
        }
    });

    // 表单提交验证
    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // 获取表单输入值
        const username = registerForm.querySelector('input[placeholder="用户名"]')?.value;
        const email = registerForm.querySelector('input[placeholder="电子邮箱地址"]')?.value;
        const password = registerForm.querySelector('input[placeholder="密码"]')?.value;
        const confirmPassword = registerForm.querySelector('input[placeholder="确认密码"]')?.value;
        const captchaInput = captchaGroup.querySelector('input');
        
        if (!username || !email || !password || !confirmPassword || !captchaInput) {
            message.error('请填写所有必填项');
            return;
        }

        // 验证用户名
        if (username.length < 4) {
            message.error('用户名长度必须大于等于4位');
            return;
        }
        if (username.length > 8) {
            message.error('用户名长度不能超过8位');
            return;
        }
        if (/^\d+$/.test(username)) {
            message.error('用户名不能为纯数字');
            return;
        }

        // 验证邮箱格式
        const emailError = validateEmail(email);
        if (emailError) {
            message.error(emailError);
            return;
        }

        // 验证密码
        const passwordError = validatePassword(password);
        if (passwordError) {
            message.error(passwordError);
            return;
        }

        // 验证两次密码是否一致
        if (password !== confirmPassword) {
            message.error('两次输入的密码不一致');
            return;
        }

        // 验证验证码答案
        if (parseInt(captchaInput.value) !== currentCaptcha.answer) {
            message.error('验证答案错误，请重试！');
            currentCaptcha = generateCaptcha();
            captchaInput.placeholder = currentCaptcha.question;
            captchaInput.value = '';
            return;
        }

        // 发送注册请求
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                message.success('注册成功！');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1500);
            } else {
                message.error(data.message || '注册失败，请稍后重试');
            }
        } catch (error) {
            debug.error('注册请求失败:', error);
            message.error('注册失败，请稍后重试');
        }
    });
}

// 添加加密解密工具函数
function encrypt(text) {
    // 使用 Base64 进行基本加密
    return btoa(encodeURIComponent(text));
}

function decrypt(encoded) {
    try {
        // 解密 Base64 编码的字符串
        return decodeURIComponent(atob(encoded));
    } catch (e) {
        console.error('解密失败:', e);
        return null;
    }
}

// 修改 cookie 工具函数
function setUserCookie(userData, days) {
    try {
        // 将用户数据对象转换为字符串并加密
        const encryptedData = encrypt(JSON.stringify(userData));
        const expires = new Date();
        expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
        document.cookie = `userData=${encryptedData};expires=${expires.toUTCString()};path=/`;
    } catch (e) {
        console.error('设置 cookie 失败:', e);
    }
}

function getUserCookie() {
    try {
        const nameEQ = "userData=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                const encryptedData = c.substring(nameEQ.length, c.length);
                const decryptedData = decrypt(encryptedData);
                return decryptedData ? JSON.parse(decryptedData) : null;
            }
        }
        return null;
    } catch (e) {
        console.error('获取 cookie 失败:', e);
        return null;
    }
}

// 用户相关功能模块

/**
 * 处理忘记密码表单的提交和验证
 * 包含邮箱验证和验证码发送功能
 */
function handleForgotPasswordForm() {
    const forgotForm = document.querySelector('.forgot-password-form');
    if (!forgotForm) return;

    forgotForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const usernameOrEmail = forgotForm.querySelector('input[placeholder="用户名/邮箱"]').value;

        if (!usernameOrEmail) {
            message.error('请输入用户名或邮箱');
            return;
        }

        try {
            const response = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ usernameOrEmail })
            });

            const data = await response.json();

            if (response.ok) {
                message.success('重置密码邮件已发送，请检查您的邮箱');
            } else {
                message.error(data.message || '操作失败，请稍后重试');
            }
        } catch (error) {
            console.error('请求失败:', error);
            message.error('操作失败，请稍后重试');
        }
    });
}

/**
 * 处理重置密码表单的提交和验证
 * 包含密码强度验证和确认密码匹配检查
 */
function handleResetPasswordForm() {
    const resetForm = document.querySelector('.reset-password-form');
    if (!resetForm) return;

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    setupPasswordToggle(resetForm);

    resetForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const password = resetForm.querySelector('input[placeholder="新密码"]').value;
        const confirmPassword = resetForm.querySelector('input[placeholder="确认新密码"]').value;

        // 验证密码
        const passwordError = validatePassword(password);
        if (passwordError) {
            message.warning(passwordError);
            return;
        }

        if (password !== confirmPassword) {
            message.warning('两次输入的密码不一致');
            return;
        }

        try {
            const response = await fetch('/api/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: token,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                message.success('密码重置成功！');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1500);
            } else {
                message.error(data.message || '重置密码失败，请稍后重试');
            }
        } catch (error) {
            console.error('重置密码请求失败:', error);
            message.error('重置密码失败，请稍后重试');
        }
    });
}

/**
 * 初始化所有用户相关表单
 * 包括登录、注册、忘记密码和重置密码功能
 */
function initializeForms() {
    handleLoginForm();     // 处理登录表单
    handleRegisterForm();  // 处理注册表单
    handleForgotPasswordForm(); // 处理忘记密码表单
    handleResetPasswordForm();  // 处理重置密码表单
    checkUserStatus();     // 检查用户登录状态
}

// 统一的 DOMContentLoaded 事件处理
document.addEventListener('DOMContentLoaded', initializeForms);

// 确保在页面加载完成后执行检查
document.addEventListener('DOMContentLoaded', function() {
    debug.log('页面加载完成，开始检查用户状态'); // 添加调试日志
    checkUserStatus();
});
