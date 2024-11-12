/**
 * 导航栏功能初始化
 * 包含用户界面更新、滚动效果、进度条和移动端菜单
 * @returns {Function} 清理函数，用于移除事件监听器
 */
function initializeNavigation() {
    const header = document.querySelector('.theader');
    const menuBtn = document.getElementById('menuBtn');
    const navLinks = document.querySelector('.nav-links');
    const progressBar = document.querySelector('.progress-bar');
    const userContainer = document.querySelector('.user-container');

    /**
     * 更新用户界面
     * 处理用户登录状态显示和下拉菜单
     */
    function updateUserInterface() {
        if (!userContainer) {
            message.error('用户界面元素未找到');
            return;
        }
        
        try {
            // 获取加密的用户数据
            const nameEQ = "userData=";
            const ca = document.cookie.split(';');
            let userData = null;
            
            for(let c of ca) {
                c = c.trim();
                if (c.indexOf(nameEQ) === 0) {
                    const encryptedData = c.substring(nameEQ.length);
                    // 解密数据
                    const decryptedData = decodeURIComponent(atob(encryptedData));
                    userData = JSON.parse(decryptedData);
                    break;
                }
            }

            if (userData && userData.username) {
                // 清空现有内容
                userContainer.innerHTML = '';
                
                // 创建用户名显示元素
                const usernameSpan = document.createElement('span');
                usernameSpan.textContent = userData.username;
                usernameSpan.className = 'username';
                
                // 创建下拉菜单
                const dropdownMenu = document.createElement('div');
                dropdownMenu.className = 'dropdown-menu';
                
                // 创建退出按钮
                const logoutLink = document.createElement('a');
                logoutLink.href = '#';
                logoutLink.className = 'dropdown-item';
                logoutLink.textContent = '退出';
                logoutLink.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    document.cookie = 'userData=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
                    document.cookie = 'savedUsername=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
                    window.location.reload();
                };
                
                // 组装界面
                dropdownMenu.appendChild(logoutLink);
                userContainer.appendChild(usernameSpan);
                userContainer.appendChild(dropdownMenu);
                
                // 添加用户名点击事件
                usernameSpan.onclick = function(e) {
                    e.stopPropagation();
                    dropdownMenu.classList.toggle('show');
                };
                
                // 点击其他地方关闭下拉菜单
                document.addEventListener('click', function() {
                    dropdownMenu.classList.remove('show');
                });
            }
        } catch (error) {
            console.error('更新用户界面失败:', error);
            message.error('更新用户界面失败');
        }
    }

    // 初始化时检查用户状态
    updateUserInterface();

    /**
     * 检查滚动状态并更新导航栏样式
     */
    function checkScroll() {
        if (window.scrollY > 0) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }

    // 初始化进度条功能
    if (progressBar) {
        function updateProgressBar() {
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrolled = window.pageYOffset || document.documentElement.scrollTop;
            const progress = (scrolled / totalHeight) * 100;
            progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        }
        
        window.addEventListener('scroll', updateProgressBar, { passive: true });
        window.addEventListener('load', updateProgressBar);
        updateProgressBar();
    }

    /**
     * 移动端菜单控制
     * 包含汉堡菜单、点击外部关闭和ESC键关闭
     */
    if (menuBtn && navLinks) {
        // 点击汉堡菜单
        menuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        // 点击页面其他区域关闭菜单
        document.addEventListener('click', function(event) {
            if (!event.target.closest('.theader')) {
                menuBtn.classList.remove('active');
                navLinks.classList.remove('active');
            }
        });

        // 点击导航链接时关闭菜单
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menuBtn.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });

        // ESC键关闭菜单
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                menuBtn.classList.remove('active');
                navLinks.classList.remove('active');
            }
        });

        // 阻止菜单内部点击事件冒泡
        navLinks.addEventListener('click', function(event) {
            event.stopPropagation();
        });
    }

    // 初始化滚动检查
    checkScroll();
    
    // 添加滚动监听
    window.addEventListener('scroll', checkScroll, { passive: true });

    // 返回清理函数
    return function cleanup() {
        window.removeEventListener('scroll', checkScroll);
        if (progressBar) {
            window.removeEventListener('scroll', updateProgressBar);
            window.removeEventListener('load', updateProgressBar);
        }
        // 清理用户相关的事件监听器
        document.removeEventListener('click', () => {
            const dropdownMenu = userContainer?.querySelector('.dropdown-menu');
            if (dropdownMenu) {
                dropdownMenu.style.display = 'none';
            }
        });
    };
}

/**
 * 搜索功能初始化
 * 包含搜索框、结果展示和键盘快捷键
 */
function initializeSearch() {
    const searchBtn = document.querySelector('.search');
    const searchModal = document.querySelector('.search-modal');
    const closeBtn = document.querySelector('.search-modal .close-btn');
    const searchInput = document.querySelector('.search-input');
    const searchButton = document.querySelector('.search-button');

    if (!searchBtn || !searchModal || !closeBtn || !searchInput) {
        message.error('搜索组件初始化失败');
        return;
    }

    // 处理回车键
    function handleEnterKey(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const keyword = searchInput.value.trim();
            if (!keyword) {
                message.warning('请输入搜索关键词');
                return;
            }
            // 关闭搜索模态框
            closeSearchModal();
            // 跳转到搜索页面
            window.location.href = `/search?keyword=${encodeURIComponent(keyword)}`;
        }
    }

    // 执行搜索
    async function performSearch() {
        const keyword = searchInput.value.trim();
        if (!keyword) {
            message.warning('请输入搜索关键词');
            return;
        }
        // 关闭搜索模态框
        closeSearchModal();
        // 跳转到搜索页面
        window.location.href = `/search?keyword=${encodeURIComponent(keyword)}`;
    }

    // 打开搜索模态框
    function openSearchModal() {
        searchModal.classList.add('active');
        searchInput.focus();
        // 在打开模态框时绑定回车事件
        searchInput.addEventListener('keydown', handleEnterKey);
    }

    // 关闭搜索模态框
    function closeSearchModal() {
        searchModal.classList.remove('active');
        searchInput.value = '';
        // 关闭模态框时移除回车事件
        searchInput.removeEventListener('keydown', handleEnterKey);
    }

    // 处理 ESC 键
    function handleEscKey(e) {
        if (e.key === 'Escape' && searchModal.classList.contains('active')) {
            closeSearchModal();
        }
    }

    // 绑定事件监听器
    searchBtn.addEventListener('click', openSearchModal);
    closeBtn.addEventListener('click', closeSearchModal);
    document.addEventListener('keydown', handleEscKey);
    searchInput.addEventListener('keydown', handleEnterKey);
    
    // 搜索按钮点击事件
    if (searchButton) {
        searchButton.addEventListener('click', performSearch);
    }

    // 返回清理函数
    return function cleanup() {
        searchBtn.removeEventListener('click', openSearchModal);
        closeBtn.removeEventListener('click', closeSearchModal);
        document.removeEventListener('keydown', handleEscKey);
        searchInput.removeEventListener('keydown', handleEnterKey);
        if (searchButton) {
            searchButton.removeEventListener('click', performSearch);
        }
    };
}

/**
 * 打字机效果实现
 * @param {string} text 要显示的文本
 * @param {HTMLElement} element 目标元素
 * @param {number} speed 打字速度（毫秒）
 * @returns {Promise} 完成打字的Promise
 */
function typeWriter(text, element, speed = 100) {
    return new Promise(resolve => {
        let i = 0;
        element.textContent = ''; // 清空原有内容
        
        function type() {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                setTimeout(type, speed);
            } else {
                resolve();
            }
        }
        
        type();
    });
}

/**
 * 初始化标题打字效果
 * 只在首页执行
 */
async function initializeTypeWriter() {
    const title = document.querySelector('.header-info h2');
    const subtitle = document.querySelector('.header-info p');
    
    // 如果不是首页（没有相关元素），直接返回
    if (!title || !subtitle) return;
    
    // 存储原始文本
    const titleText = '相遇有缘，更是惊喜！';
    const subtitleText = '资源在下面！往下滑！';
    
    // 清空原有内容
    title.textContent = '';
    subtitle.textContent = '';
    
    // 添加光标效果的类
    title.classList.add('typing');
    
    // 先打印标题
    await typeWriter(titleText, title, 150);
    
    // 移除标题的光标，给副标题添加光标
    title.classList.remove('typing');
    subtitle.classList.add('typing');
    
    // 打印副标题
    await typeWriter(subtitleText, subtitle, 100);
    
    // 完成后移除光标
    setTimeout(() => {
        subtitle.classList.remove('typing');
    }, 500);
    
    // 返回清理函数
    return function cleanup() {
        // 如果需要清理工作，可以在这里添加
    };
}

/**
 * 图片轮播功能
 * 支持前后切换和淡入淡出效果
 * @returns {Function} 清理函数
 */
function initializeImageSlider() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const imageContainer = document.querySelector('.image-container img');
    const emailBtn = document.querySelector('.nav-btn.email i');
    
    // 如果页面上没有相关元素，直接返回
    if (!navBtns.length || !imageContainer || !emailBtn) {
        return null;
    }
    
    const defaultImage = '../images/login_bg.jpg';
    
    // 更新图片的函数
    async function updateImage() {
        try {
            emailBtn.className = 'fa-solid fa-spinner fa-spin';
            const response = await fetch('/api/random-image');
            const data = await response.json();
            
            if (data.success) {
                imageContainer.src = data.data.image_url;
                imageContainer.onload = () => {
                    emailBtn.className = 'fa-solid fa-paw';
                };
            } else {
                console.error('初始化图片失败:', data.message);
                imageContainer.src = defaultImage;
                emailBtn.className = 'fa-solid fa-paw';
            }
        } catch (error) {
            console.error('初始化图片请求失败:', error);
            imageContainer.src = defaultImage;
            emailBtn.className = 'fa-solid fa-paw';
        }
    }
    
    // 初始更新图片
    updateImage();
    
    // 为每个导航按钮添加点击事件
    navBtns.forEach(btn => {
        btn.addEventListener('click', updateImage);
    });
    
    // 返回清理函数
    return function cleanup() {
        navBtns.forEach(btn => {
            btn.removeEventListener('click', updateImage);
        });
    };
}

/**
 * 花瓣效果初始化
 * @param {HTMLCanvasElement} canvas 画布元素
 */
function initializePetalEffect(canvas) {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const petals = [];
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    
    // 设置画布大小
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // 花瓣类
    class Petal {
        constructor() {
            this.x = Math.random() * canvasWidth;
            this.y = Math.random() * canvasHeight;
            this.size = Math.random() * 5 + 5;
            this.speedX = Math.random() * 2 - 1;
            this.speedY = Math.random() * 1 + 1;
            this.rotation = Math.random() * 360;
            this.rotationSpeed = Math.random() * 2 - 1;
        }
        
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.rotation += this.rotationSpeed;
            
            if (this.y > canvasHeight) {
                this.y = -10;
                this.x = Math.random() * canvasWidth;
            }
        }
        
        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation * Math.PI / 180);
            ctx.fillStyle = 'rgba(255, 192, 203, 0.7)';
            ctx.beginPath();
            ctx.ellipse(0, 0, this.size, this.size / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    
    // 创建花瓣
    for (let i = 0; i < 50; i++) {
        petals.push(new Petal());
    }
    
    // 动画循环
    function animate() {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        petals.forEach(petal => {
            petal.update();
            petal.draw();
        });
        requestAnimationFrame(animate);
    }
    
    // 开始动画
    animate();
    
    // 窗口大小改变时重置画布大小
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
    
    // 返回清理函数
    return function cleanup() {
        window.removeEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });
    };
}

// 在 DOMContentLoaded 时初始化所导航相关功能
document.addEventListener('DOMContentLoaded', function() {
    const cleanupNav = initializeNavigation();
    const cleanupSearch = initializeSearch();
    const cleanupSlider = initializeImageSlider();
    const cleanupTypeWriter = initializeTypeWriter();
    const canvas = document.getElementById('particleCanvas');
    let cleanupPetal = null;
    
    // 页面卸载时清理
    window.addEventListener('unload', () => {
        if (cleanupNav) cleanupNav();
        if (cleanupSearch) cleanupSearch();
        if (cleanupSlider) cleanupSlider();
        if (cleanupTypeWriter) cleanupTypeWriter();
        if (cleanupPetal) cleanupPetal();
    });
    
    if (canvas) {
        cleanupPetal = initializePetalEffect(canvas);
    }
});

// 花瓣效果初始化

// 在加载页面内容调用初始化
async function loadPageContent(pagePath) {
    try {
        const response = await fetch(`/system/views/${pagePath}.html`);
        const html = await response.text();
        document.getElementById('mainContent').innerHTML = html;
        
        // 根据页面类型调用相应的初始化函数
        if (pagePath.includes('article')) {
            await ArticleManager.init();
        } else if (pagePath.includes('user')) {
            await UserManager.init();
        } else if (pagePath.includes('menu')) {
            await MenuManager.init();
        }
    } catch (error) {
        console.error('加载页面失败:', error);
    }
}


