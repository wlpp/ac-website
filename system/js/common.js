// 页面加载管理
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing...');  // 添加调试日志
    
    // 初始化粒子效果
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
                detect_on: 'window',  // 改为window提高检测范围
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
        console.log('Particles initialized successfully');
    } else {
        console.error('particles.js not loaded!');
    }

    // 绑定菜单点击事件
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

    // 默认加载用户列表页面
    loadPage('user/list');
});

// 菜单配置
const menuConfig = {
    'user/list': {  // 恢复完整路径
        icon: 'fa-users',
        text: '用户管理'
    },
    'article/list': {
        icon: 'fa-newspaper',
        text: '文章管理'
    },
    'menu/list': {
        icon: 'fa-bars',
        text: '菜单管理'
    }
};

// 加载页面内容
async function loadPage(path) {
    try {
        // 添加 views 到路径中
        const response = await fetch(`/system/views/${path}.html`);
        console.log('Loading page:', `/system/views/${path}.html`); // 调试日志
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        document.getElementById('mainContent').innerHTML = html;
        
        // 更新面包屑
        updateBreadcrumb(path);
        
        // 更新菜单激活状态
        updateMenuActive(path);
        
        // 加载对应的JS文件
        const module = path.split('/')[0];
        await loadModuleScript(module);
        
        // 初始化页面
        if (typeof window.initPage === 'function') {
            window.initPage();
        }
    } catch (error) {
        console.error('Error loading page:', error);
        console.error('Path attempted:', `/system/views/${path}.html`); // 额外的调试信息
    }
}

// 加载模块JS文件
async function loadModuleScript(module) {
    // 检查是否已加载
    const existingScript = document.querySelector(`script[src="/system/js/${module}.js"]`);
    if (!existingScript) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `/system/js/${module}.js`;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
}

// 更新面包屑
function updateBreadcrumb(path) {
    const breadcrumb = document.querySelector('.breadcrumb');
    if (breadcrumb && menuConfig[path]) {
        breadcrumb.innerHTML = `
            <i class="fas fa-home"></i>
            <span>首页</span>
            <i class="fas fa-chevron-right"></i>
            <i class="fas ${menuConfig[path].icon}"></i>
            <span>${menuConfig[path].text}</span>
        `;
    }
}

// 更新菜单激活状态
function updateMenuActive(path) {
    document.querySelectorAll('.menu a').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === path) {
            link.classList.add('active');
        }
    });
}