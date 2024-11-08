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
            layer.msg('表单元素未找到', { icon: 2, time: 2000 });
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
                
                layer.msg('登录成功！', {
                    icon: 1,
                    time: 1500,
                    end: function() {
                        // 先更新用户界面
                        updateUserInterface(userData);
                        // 延迟跳转，确保界面更新完成
                        setTimeout(() => {
                            window.location.href = '/';
                        }, 100);
                    }
                });
            } else {
                layer.msg(data.message, {
                    icon: 2,
                    time: 2000
                });
            }
        } catch (error) {
            console.error('登录请求失败:', error);
            layer.msg('登录失败，请稍后重试', {
                icon: 2,
                time: 2000
            });
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
        console.log('检测到用户数据:', userData); // 添加调试日志
        updateUserInterface(userData);
    } else {
        console.log('未检测到用户数据'); // 添加调试日志
    }
}

// 处理注册表单
function handleRegisterForm() {
    const form = document.querySelector('.register-form');
    if (!form) return; // 如果没有找到注册表单，直接返回
    
    // 创建并插入验证问题输入框
    const captchaGroup = document.createElement('div');
    captchaGroup.className = 'form-group';
    captchaGroup.innerHTML = `
        <input type="text" placeholder="${currentCaptcha.question}" required>
        <i class="fa-solid fa-calculator"></i>
    `;
    
    // 将验证问题插入到表单中（在提交按钮之前）
    const submitBtn = form.querySelector('.register-btn');
    if (submitBtn) {
        form.insertBefore(captchaGroup, submitBtn);
    }
    
    // 添加密码显示/隐藏功能
    const passwordFields = form.querySelectorAll('input[type="password"]');
    const passwordIcons = form.querySelectorAll('.fa-lock');

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
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // 获取表单输入值
        const username = form.querySelector('input[placeholder="用户名"]')?.value;
        const email = form.querySelector('input[placeholder="电子邮箱地址"]')?.value;
        const password = form.querySelector('input[placeholder="密码"]')?.value;
        const confirmPassword = form.querySelector('input[placeholder="确认密码"]')?.value;
        const captchaInput = captchaGroup.querySelector('input');
        
        if (!username || !email || !password || !confirmPassword || !captchaInput) {
            layer.msg('请填写所有必填项', { icon: 2, time: 2000 });
            return;
        }

        // 验证用户名
        if (username.length < 4) {
            layer.msg('用户名长度必须大于等于4位', { icon: 2, time: 2000 });
            return;
        }
        if (username.length > 8) {
            layer.msg('用户名长度不能超过8位', { icon: 2, time: 2000 });
            return;
        }
        if (/^\d+$/.test(username)) {
            layer.msg('用户名不能为纯数字', { icon: 2, time: 2000 });
            return;
        }

        // 验证邮箱格式
        const emailError = validateEmail(email);
        if (emailError) {
            layer.msg(emailError, { icon: 2, time: 2000 });
            return;
        }

        // 验证密码
        const passwordError = validatePassword(password);
        if (passwordError) {
            layer.msg(passwordError, { icon: 2, time: 2000 });
            return;
        }

        // 验证两次密码是否一致
        if (password !== confirmPassword) {
            layer.msg('两次输入的密码不一致', { icon: 2, time: 2000 });
            return;
        }

        // 验证验证码答案
        if (parseInt(captchaInput.value) !== currentCaptcha.answer) {
            layer.msg('验证答案错误，请重试！', { icon: 2, time: 2000 });
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
                // 注册成功
                layer.msg('注册成功！', {
                    icon: 1,
                    time: 1500,
                    end: function() {
                        // 注册成功后跳转到登录页
                        window.location.href = '/login';
                    }
                });
            } else {
                // 注册失败，显示错误信息
                layer.msg(data.message, {
                    icon: 2,
                    time: 2000
                });
            }
        } catch (error) {
            console.error('注册请求失败:', error);
            layer.msg('注册失败，请稍后重试', {
                icon: 2,
                time: 2000
            });
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
    if (forgotForm) {
        forgotForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const usernameOrEmail = forgotForm.querySelector('input[placeholder="用户名/邮箱"]').value;
            
            if (!usernameOrEmail) {
                layer.msg('请输入用户名或邮箱', {
                    icon: 2,
                    time: 2000
                });
                return;
            }
            
            try {
                const response = await fetch('/api/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username_or_email: usernameOrEmail
                    })
                });

                const data = await response.json();
                
                if (response.ok) {
                    layer.msg('重置密码邮件已发送，检查您邮箱', {
                        icon: 1,
                        time: 3000,
                        end: function() {
                            // 可以选择是否跳转到登录页
                            // window.location.href = '/login';
                        }
                    });
                } else {
                    layer.msg(data.message || '操作失败，请稍后重试', {
                        icon: 2,
                        time: 2000
                    });
                }
            } catch (error) {
                console.error('请求失败:', error);
                layer.msg('操作失败，请稍后重试', {
                    icon: 2,
                    time: 2000
                });
            }
        });
    }
}

/**
 * 处理重置密码表单的提交和验证
 * 包含密码强度验证和确认密码匹配检查
 */
function handleResetPasswordForm() {
    const resetForm = document.querySelector('.reset-password-form');
    if (resetForm) {
        // 从 URL 获取重置令牌
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        // 设置密码显示/隐藏切换功能
        setupPasswordToggle(resetForm);
        
        // 处理表单提交
        resetForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const password = resetForm.querySelector('input[placeholder="新密码"]').value;
            const confirmPassword = resetForm.querySelector('input[placeholder="确认新密码"]').value;
            
            // 验证密码
            const passwordError = validatePassword(password);
            if (passwordError) {
                layer.msg(passwordError, { icon: 2, time: 2000 });
                return;
            }
            
            // 验证两次密码是否一致
            if (password !== confirmPassword) {
                layer.msg('两次输入的密码不一致', { icon: 2, time: 2000 });
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
                    layer.msg('密码重置成功！', {
                        icon: 1,
                        time: 1500,
                        end: function() {
                            // 重置成功后跳转到登录页
                            window.location.href = '/login';
                        }
                    });
                } else {
                    layer.msg(data.message || '重置密码失败，请稍后重试', {
                        icon: 2,
                        time: 2000
                    });
                }
            } catch (error) {
                console.error('重置密码请求失败:', error);
                layer.msg('重置密码失败，请稍后重试', {
                    icon: 2,
                    time: 2000
                });
            }
        });
    }
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
    console.log('页面加载完成，开始检查用户状态'); // 添加调试日志
    checkUserStatus();
});
