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

// 当页面加载完成时设置验证问题
document.addEventListener('DOMContentLoaded', function() {
    const form = document.querySelector('.register-form');
    
    // 创建并插入验证问题输入框
    const captchaGroup = document.createElement('div');
    captchaGroup.className = 'form-group';
    captchaGroup.innerHTML = `
        <input type="text" placeholder="${currentCaptcha.question}" required>
        <i class="fa-solid fa-calculator"></i>
    `;
    
    // 将验证问题插入到表单中（在提交按钮之前）
    const submitBtn = form.querySelector('.register-btn');
    form.insertBefore(captchaGroup, submitBtn);
    
    // 验证用户名
    function validateUsername(username) {
        if (username.length < 6) {
            return '用户名长度必须大于6位';
        }
        if (/^\d+$/.test(username)) {
            return '用户名不能为纯数字';
        }
        return '';
    }

    // 验证密码
    function validatePassword(password) {
        if (password.length < 6) {
            return '密码长度必须大于6位';
        }
        if (/[\u4e00-\u9fa5]/.test(password)) {
            return '密码不能包含中文字符';
        }
        return '';
    }

    // 添加密码显示/隐藏功能
    const passwordFields = document.querySelectorAll('input[type="password"]');
    const passwordIcons = document.querySelectorAll('.fa-lock');

    passwordIcons.forEach((icon, index) => {
        icon.style.cursor = 'pointer'; // 添加鼠标手型样式
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

        // 添加鼠标悬停提示
        icon.setAttribute('title', '点击显示/隐藏密码');
    });

    // 表单提交验证
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // 获取表单输入值
        const username = form.querySelector('input[placeholder="用户名"]').value;
        const email = form.querySelector('input[placeholder="电子邮箱地址"]').value;
        const password = form.querySelector('input[placeholder="密码"]').value;
        const confirmPassword = form.querySelector('input[placeholder="确认密码"]').value;
        const captchaInput = captchaGroup.querySelector('input');
        const userAnswer = parseInt(captchaInput.value);

        // 验证用户名
        const usernameError = validateUsername(username);
        if (usernameError) {
            layer.msg(usernameError, { icon: 2, time: 2000 });
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
        if (userAnswer !== currentCaptcha.answer) {
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
});
