// 页面加载管理
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing particles...');  // 添加调试日志
    
    if (window.particlesJS) {
        particlesJS('particles-js', {
            particles: {
                number: {
                    value: 40,  // 减少粒子数量
                    density: {
                        enable: true,
                        value_area: 1000  // 增加区域，使粒子更分散
                    }
                },
                color: {
                    value: '#4299e1'  // 使用主题蓝色
                },
                shape: {
                    type: 'circle'
                },
                opacity: {
                    value: 0.6,  // 降低不透明度
                    random: false,
                    animation: {
                        enable: true,
                        speed: 2,  // 加快透明度变化
                        opacity_min: 0.2,
                        sync: false
                    }
                },
                size: {
                    value: 2,  // 减小粒子大小
                    random: true,
                    animation: {
                        enable: true,
                        speed: 3,  // 加快大小变化
                        size_min: 0.1,
                        sync: false
                    }
                },
                line_linked: {
                    enable: true,
                    distance: 180,  // 增加连线距离
                    color: '#4299e1',
                    opacity: 0.4,  // 降低线条不透明度
                    width: 1  // 减小线条宽度
                },
                move: {
                    enable: true,
                    speed: 3,  // 加快移动速度
                    direction: 'none',
                    random: true,  // 启用随机移动
                    straight: false,
                    out_mode: 'bounce',  // 改为bounce，让粒子在边界反弹
                    bounce: true,
                    attract: {  // 添加吸引效果
                        enable: true,  // 启用吸引效果
                        rotateX: 600,
                        rotateY: 1200
                    }
                }
            },
            interactivity: {
                detect_on: 'window',  // 改为window以提高检测范围
                events: {
                    onhover: {
                        enable: true,
                        mode: 'repulse',
                        parallax: {  // 添加视差效果
                            enable: true,
                            force: 60,
                            smooth: 10
                        }
                    },
                    onclick: {
                        enable: true,
                        mode: 'push'
                    },
                    resize: true
                },
                modes: {
                    repulse: {
                        distance: 150,  // 增加扩散距离
                        duration: 0.2,  // 减少扩散持续时间
                        speed: 2,  // 加快扩散速度
                        factor: 100,
                        maxSpeed: 100,  // 增加最大速度
                        easing: 'ease-out-quad'
                    },
                    push: {
                        particles_nb: 4
                    },
                    remove: {
                        particles_nb: 2
                    }
                }
            },
            retina_detect: true,
            fps_limit: 60  // 限制帧率以优化性能
        });
        console.log('Particles initialized successfully');  // 添加成功日志
    } else {
        console.error('particles.js not loaded!');  // 添加错误日志
    }

    // 默认加载用户管理页面
    loadPage('user/list');

    // 为菜单项添加点击事件
    document.querySelectorAll('.menu a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            loadPage(page);
            
            // 更新菜单激活状态
            document.querySelectorAll('.menu a').forEach(a => a.classList.remove('active'));
            this.classList.add('active');
        });
    });
});

// 加载页面内容
function loadPage(page) {
    const contentDiv = document.getElementById('mainContent');
    
    // 显示加载状态
    contentDiv.innerHTML = '<div class="loading"></div>';
    
    // 使用XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `/system/${page}.html`, true);
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            // 更新内容
            contentDiv.innerHTML = xhr.responseText;
            
            // 加载对应的JS文件
            const scriptPath = `/system/js/${page.split('/')[0]}.js`;
            loadScript(scriptPath);
        } else {
            contentDiv.innerHTML = `<div class="error">页面加载失败: ${xhr.status}</div>`;
            console.error('加载失败:', xhr.status);
        }
    };
    
    xhr.onerror = function(e) {
        contentDiv.innerHTML = '<div class="error">页面加载失败</div>';
        console.error('加载错误:', e);
    };
    
    xhr.send();
}

// 添加新的函数来加载脚本
function loadScript(src) {
    // 移除旧脚本
    const oldScript = document.querySelector(`script[src="${src}"]`);
    if (oldScript) {
        oldScript.remove();
    }
    
    // 添加新脚本
    const script = document.createElement('script');
    script.src = src;
    script.onload = function() {
        // 脚本加载完成后，如果有初始化函数就调用它
        if (typeof initPage === 'function') {
            initPage();
        }
    };
    document.body.appendChild(script);
} 