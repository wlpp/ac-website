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
        if (!userContainer) return;
        
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
            header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            header.style.padding = '5px 40px';
        } else {
            header.classList.remove('scrolled');
            header.style.boxShadow = 'none';
            header.style.padding = '5px 40px';
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
        console.warn('搜索相关元素未找到');
        return;
    }

    function openSearchModal(e) {
        e.preventDefault();
        searchModal.classList.add('active');
        searchInput.focus();
    }

    function closeSearchModal() {
        searchModal.classList.remove('active');
        searchInput.value = '';
    }

    function handleEscKey(e) {
        if (e.key === 'Escape' && searchModal.classList.contains('active')) {
            closeSearchModal();
        }
    }

    // 执行搜索的函数
    async function performSearch() {
        const keyword = searchInput.value.trim();
        if (!keyword) {
            alert('请输入搜索关键词');
            return;
        }

        const articleSection = document.querySelector('.article-section');
        if (!articleSection) return;

        try {
            const response = await fetch(`${baseURL}/api/articles/search?keyword=${encodeURIComponent(keyword)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // 清空现有内容
            const sectionTitle = articleSection.querySelector('.section-title');
            articleSection.innerHTML = '';
            if (sectionTitle) {
                articleSection.appendChild(sectionTitle);
            }

            if (data.data && data.data.length > 0) {
                // 渲染搜索结果
                data.data.forEach(article => {
                    const articleCard = renderArticleCard(article);
                    articleSection.appendChild(articleCard);
                });
                
                // 重新初始化懒加载
                lazyLoad();
            } else {
                // 显示无结果提示
                articleSection.innerHTML += `
                    <div class="no-results">
                        <p>未找到与"${keyword}"相关的文章</p>
                    </div>
                `;
            }

            // 搜索成功后关闭弹窗
            closeSearchModal();

        } catch (error) {
            console.error('搜索失败:', error);
            alert('搜索失败，请稍后重试');
        }
    }

    // 监听回车键
    function handleEnterKey(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    }

    // 监听搜索按钮点击
    function handleSearchClick(e) {
        e.preventDefault();
        performSearch();
    }

    // 添加事件监听器
    searchBtn.addEventListener('click', openSearchModal);
    closeBtn.addEventListener('click', closeSearchModal);
    document.addEventListener('keydown', handleEscKey);
    searchInput.addEventListener('keypress', handleEnterKey);
    if (searchButton) {
        searchButton.addEventListener('click', handleSearchClick);
    }

    // 返回清理函数
    return function cleanup() {
        searchBtn.removeEventListener('click', openSearchModal);
        closeBtn.removeEventListener('click', closeSearchModal);
        document.removeEventListener('keydown', handleEscKey);
        searchInput.removeEventListener('keypress', handleEnterKey);
        if (searchButton) {
            searchButton.removeEventListener('click', handleSearchClick);
        }
    };
}

// 花瓣效果初始化
function initializePetalEffect(canvas) {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Petal {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = -20;
            this.size = Math.random() * 8 + 5;
            this.speedX = Math.random() * 2 - 1;
            this.speedY = Math.random() * 1 + 0.5;
            this.rotation = Math.random() * 360;
            this.rotationSpeed = (Math.random() - 0.5) * 2;
            this.opacity = Math.random() * 0.6 + 0.2;
            this.color = this.getRandomColor();
        }

        getRandomColor() {
            const colors = ['#ffd1dc', '#ffb7c5', '#ff9ecd', '#ffc0cb', '#ffffff'];
            return colors[Math.floor(Math.random() * colors.length)];
        }

        update() {
            this.x += this.speedX + Math.sin(this.y / 50) * 0.5;
            this.y += this.speedY;
            this.rotation += this.rotationSpeed;

            if (this.y > canvas.height + 20) {
                this.reset();
            }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate((this.rotation * Math.PI) / 180);
            ctx.globalAlpha = this.opacity;

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(
                this.size/2, -this.size/2,
                this.size, 0,
                this.size/2, this.size/2
            );
            ctx.bezierCurveTo(
                this.size/2, this.size,
                -this.size/2, this.size,
                -this.size/2, this.size/2
            );
            ctx.bezierCurveTo(
                -this.size, 0,
                -this.size/2, -this.size/2,
                0, 0
            );

            ctx.fillStyle = this.color;
            ctx.fill();
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.restore();
        }
    }

    const petals = Array.from({ length: 50 }, () => {
        const petal = new Petal();
        petal.y = Math.random() * canvas.height;
        return petal;
    });

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        petals.forEach(petal => {
            petal.update();
            petal.draw();
        });
        requestAnimationFrame(animate);
    }

    animate();
}

// 在 DOMContentLoaded 时初始化所有导航相关功能
document.addEventListener('DOMContentLoaded', function() {
    const cleanupNav = initializeNavigation();
    const cleanupSearch = initializeSearch();
    const canvas = document.getElementById('particleCanvas');
    // 页面卸载时清理
    window.addEventListener('unload', () => {
        if (cleanupNav) cleanupNav();
        if (cleanupSearch) cleanupSearch();
    });
    if (canvas) {
        initializePetalEffect(canvas);
    }
});
// 花瓣效果初始化
