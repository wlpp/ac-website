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
    // loadPage('user/list');
    loadPage('article/list');
    
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

// 添加页面加载函数
async function loadPage(pageName) {
    if (!pageName) return;
    
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    try {
        // 加载页面内容
        const response = await fetch(`/system/views/${pageName}.html`);
        const html = await response.text();
        mainContent.innerHTML = html;

        // 更新面包屑
        updateBreadcrumb(pageName);

        // 更新菜单激活状态
        updateMenuActive(pageName);

        // 根据页面类型初始化不同功能
        switch(pageName) {
            case 'article/list':
                await ArticleManager.init();
                break;
            case 'user/list':
                await UserManager.init();
                break;
            case 'menu/list':
                await MenuManager.init();
                break;
        }
    } catch (error) {
        console.error('加载页面失败:', error);
        MessageBox.error('加载页面失败');
    }
}

// 修改导航点击事件处理
document.addEventListener('DOMContentLoaded', function() {
    const menuLinks = document.querySelectorAll('.menu a');
    menuLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // 移除其他链接的激活状态
            menuLinks.forEach(l => l.classList.remove('active'));
            // 添加当前链接的激活状态
            e.target.classList.add('active');
            
            // 获取页面名称并加载
            const pageName = e.target.dataset.page;
            if (pageName) {
                await loadPage(pageName);
            }
        });
    });

    // 初始加载默认页面
    const defaultPage = document.querySelector('.menu a.active');
    if (defaultPage) {
        loadPage(defaultPage.dataset.page);
    }
});

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
function updateBreadcrumb(pageName) {
    const breadcrumb = document.querySelector('.breadcrumb');
    if (breadcrumb && menuConfig[pageName]) {
        breadcrumb.innerHTML = `
            <i class="fas fa-home"></i>
            <span>首页</span>
            <i class="fas fa-chevron-right"></i>
            <i class="fas ${menuConfig[pageName].icon}"></i>
            <span>${menuConfig[pageName].text}</span>
        `;
    }
}

// 更新菜单激活状态
function updateMenuActive(pageName) {
    const menuLinks = document.querySelectorAll('.menu a');
    menuLinks.forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === pageName) {
            link.classList.add('active');
        }
    });
}

// 侧边栏切换功能
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    
    if (sidebar && main) {
        sidebar.classList.toggle('collapsed');
        main.classList.toggle('expanded');
        
        // 保存状态到 localStorage
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    }
}

// 在页面加载时恢复侧边栏状态
function initSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    
    if (sidebar && main && isCollapsed) {
        sidebar.classList.add('collapsed');
        main.classList.add('expanded');
    }
}

// 修改现有的 initializeNavigation 函数
function initializeNavigation() {
    // ... 现有代码 ...
    
    // 初始化侧边栏状态
    initSidebar();
    
    // ... 现有代码 ...
}