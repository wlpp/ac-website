document.addEventListener('DOMContentLoaded', function() {
    // 初始化粒子效果
    particlesJS('particles-js', {
        particles: {
            number: {
                value: 80,
                density: {
                    enable: true,
                    value_area: 800
                }
            },
            color: {
                value: '#4299e1'
            },
            shape: {
                type: 'circle'
            },
            opacity: {
                value: 0.5,
                random: false
            },
            size: {
                value: 3,
                random: true
            },
            line_linked: {
                enable: true,
                distance: 150,
                color: '#4299e1',
                opacity: 0.4,
                width: 1
            },
            move: {
                enable: true,
                speed: 2,
                direction: 'none',
                random: false,
                straight: false,
                out_mode: 'out',
                bounce: false
            }
        },
        interactivity: {
            detect_on: 'canvas',
            events: {
                onhover: {
                    enable: true,
                    mode: 'grab'
                },
                onclick: {
                    enable: true,
                    mode: 'push'
                },
                resize: true
            },
            modes: {
                grab: {
                    distance: 140,
                    line_linked: {
                        opacity: 1
                    }
                },
                push: {
                    particles_nb: 4
                }
            }
        },
        retina_detect: true
    });

    // 登录表单提交处理
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // 获取表单数据
        const username = document.querySelector('input[name="username"]').value;
        const password = document.querySelector('input[name="password"]').value;
        
        // 验证表单
        if (!username || !password) {
            MessageBox.error('请填写用户名和密码');
            return;
        }
        
        try {
            // 发送登录请求
            const response = await fetch('/api/system/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // 登录成功
                MessageBox.success('登录成功');
                // 保存 token 和用户信息
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.data));
                
                // 检查是否有重定向URL
                const redirectUrl = localStorage.getItem('redirectUrl');
                
                // 延迟跳转
                setTimeout(() => {
                    if (redirectUrl && redirectUrl !== '/system/views/login.html') {
                        // 清除存储的重定向URL
                        localStorage.removeItem('redirectUrl');
                        window.location.href = redirectUrl;
                    } else {
                        // 默认跳转到系统首页
                        window.location.href = '/system/views/index.html';
                    }
                }, 1000);
                
            } else {
                // 登录失败
                MessageBox.error(data.message || '登录失败');
            }
        } catch (error) {
            console.error('Login error:', error);
            MessageBox.error('登录请求失败，请稍后重试');
        }
    });
});

// 输入框焦点效果
document.querySelectorAll('.form-item input').forEach(input => {
    input.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
    });
    
    input.addEventListener('blur', function() {
        if (!this.value) {
            this.parentElement.classList.remove('focused');
        }
    });
}); 