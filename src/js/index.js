/**
 * 图片加载错误处理
 * 显示占位图片
 */
function handleImageError(img) {
    img.src = 'https://via.placeholder.com/800x600?text=Image+Not+Found';
    img.alt = '图片加载失败';
}

/**
 * 图片懒加载实现
 * 使用 data-src 属性延迟加载图片
 */
function lazyLoad() {
    const images = document.querySelectorAll('img[data-src]');
    const loadingImageUrl = 'https://s.nmxc.ltd/sakurairo_vision/@2.6/load_svg/outload.svg#lazyload-blur';
    
    images.forEach(img => {
        if (!img.dataset.loaded) {
            img.classList.add('loading');
            img.src = loadingImageUrl;
            
            const newImg = new Image();
            newImg.src = img.dataset.src;
            
            newImg.onload = function() {
                img.src = img.dataset.src;
                img.classList.remove('loading');
                img.classList.add('loaded');
                img.dataset.loaded = 'true';
            };
            
            newImg.onerror = function() {
                img.src = 'https://via.placeholder.com/800x600?text=Load+Failed';
                img.classList.remove('loading');
                img.classList.add('error');
                img.dataset.loaded = 'true';
            };
        }
    });
}

/**
 * 格式化日期为中文格式
 * @param {string} dateStr 日期字符串
 * @returns {string} 格式化后的中文日期
 */
function formatChineseDate(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    return `${year}年${month}月${day}日`;
}

/**
 * 渲染文章卡片
 * @param {Object} article 文章数据对象
 * @returns {HTMLElement} 文章卡片DOM元素
 */
function renderArticleCard(article) {
    const articleCard = document.createElement('div');
    articleCard.className = 'article-card';
    
    // 格式化日期
    const formattedDate = formatChineseDate(article.n_date);
    
    articleCard.innerHTML = `
        <a href="/article/${article.article_id}" class="article-link">
            <div class="article-image">
                <img data-src="https://s.nmxc.ltd/sakurairo_vision/@2.6/load_svg/outload.svg#lazyload-blur" 
                     alt="${article.title || '无标题'}"
                     class="loading"
                     src="https://s.nmxc.ltd/sakurairo_vision/@2.6/load_svg/outload.svg#lazyload-blur">
            </div>
            <div class="article-content">
                <h3 class="article-title">${article.title || '无标题'}</h3>
                <p class="article-desc">${article.content || '暂无内容'}</p>
                <p class="article-date">${formattedDate}</p>
            </div>
        </a>
    `;
    
    articleCard.querySelector('.article-link').addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = this.getAttribute('href');
    });
    
    return articleCard;
}

/**
 * 加载更多文章
 * 支持分页加载和错误处理
 * @param {number} page 页码
 */
async function loadMoreArticles(page = 1) {
    const articleSection = document.querySelector('.article-section');
    const loadMoreBtn = document.querySelector('.load-more-btn');
    
    if (loadMoreBtn) {
        loadMoreBtn.textContent = '加载中...';
        loadMoreBtn.disabled = true;
    }
    
    try {
        const API_URL = `${baseURL}/api/articles?page=${page}&tag=0`;
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        let articles = data.data || [];
        
        if (articles.length === 0) {
            if (loadMoreBtn) {
                loadMoreBtn.textContent = '没有更多文章';
                loadMoreBtn.disabled = true;
            }
            return;
        }
        
        // 如果是第一页，清空现有内容
        if (page === 1) {
            const sectionTitle = articleSection.querySelector('.section-title');
            articleSection.innerHTML = '';
            if (sectionTitle) {
                articleSection.appendChild(sectionTitle);
            }
        }
        
        // 渲染文章
        articles.forEach(article => {
            const articleCard = renderArticleCard(article);
            articleSection.appendChild(articleCard);
        });

        // 重新初始化懒加载
        lazyLoad();
        
        // 更新新加载的文章卡片图片
        await updateArticleImages();
        
        // 更新加载更多按钮状态
        if (loadMoreBtn) {
            loadMoreBtn.textContent = '加载更多';
            loadMoreBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('加载文章失败:', error);
        if (loadMoreBtn) {
            loadMoreBtn.textContent = '加载失败，点击重试';
            loadMoreBtn.disabled = false;
        }
    }
}

/**
 * 图片轮播功能
 * 支持前后切换和淡入淡出效果
 */
async function initializeImageSlider() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const imageContainer = document.querySelector('.image-container img');
    const emailBtn = document.querySelector('.nav-btn.email i');
    const defaultImage = '../images/login_bg.jpg';
    
    // 页面加载时获取一次随机图片
    try {
        emailBtn.className = 'fa-solid fa-spinner fa-spin'; // 显示加载图标
        const response = await fetch('/api/random-image');
        const data = await response.json();
        
        if (data.success) {
            imageContainer.src = data.data.image_url;
            // 图片加载完成后再改回原图标
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
    
    // 为每个导航按钮添加点击事件
    navBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                emailBtn.className = 'fa-solid fa-spinner fa-spin'; // 显示加载图标
                const response = await fetch('/api/random-image');
                const data = await response.json();
                
                if (data.success) {
                    imageContainer.src = data.data.image_url;
                    // 图片加载完成后再改回原图标
                    imageContainer.onload = () => {
                        emailBtn.className = 'fa-solid fa-paw';
                    };
                } else {
                    console.error('获取图片失败:', data.message);
                    emailBtn.className = 'fa-solid fa-paw'; // 失败时也改回原图标
                }
            } catch (error) {
                console.error('请求图片时出错:', error);
                emailBtn.className = 'fa-solid fa-paw'; // 错误时也改回原图标
            }
        });
    });
}

/**
 * 更新文章卡片图片
 * 获取随机图片并更新到文章卡片
 */
async function updateArticleImages() {
    try {
        const articleImages = document.querySelectorAll('.article-card .article-image img:not([data-updated="true"])');
        if (articleImages.length === 0) return;
        
        // 先显示加载效果
        const loadingImageUrl = 'https://s.nmxc.ltd/sakurairo_vision/@2.6/load_svg/outload.svg#lazyload-blur';
        articleImages.forEach(img => {
            img.classList.add('loading');
            img.src = loadingImageUrl;
        });
        
        // 请求随机图片
        const response = await fetch(`/api/random-image?count=${articleImages.length}`);
        const data = await response.json();
        
        if (data.success && data.data.image_urls) {
            articleImages.forEach((img, index) => {
                if (index < data.data.image_urls.length) {
                    const newImg = new Image();
                    newImg.src = data.data.image_urls[index];
                    
                    newImg.onload = function() {
                        img.src = data.data.image_urls[index];
                        img.dataset.src = data.data.image_urls[index];
                        img.classList.remove('loading');
                        img.classList.add('loaded');
                        img.dataset.updated = 'true';
                        img.dataset.loaded = 'true';
                    };
                    
                    newImg.onerror = function() {
                        img.src = 'https://via.placeholder.com/800x600?text=Load+Failed';
                        img.classList.remove('loading');
                        img.classList.add('error');
                        img.dataset.updated = 'true';
                        img.dataset.loaded = 'true';
                    };
                }
            });
        }
    } catch (error) {
        console.error('更新文章片失败:', error);
        // 错误时显示占位图
        articleImages.forEach(img => {
            img.src = 'https://via.placeholder.com/800x600?text=Load+Failed';
            img.classList.remove('loading');
            img.classList.add('error');
        });
    }
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
 */
async function initializeTypeWriter() {
    const title = document.querySelector('.header-info h2');
    const subtitle = document.querySelector('.header-info p');
    
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
}

// 主要的 DOMContentLoaded 事件监听器
document.addEventListener('DOMContentLoaded', function() {
    const articleSection = document.querySelector('.article-section');
    const backToTop = document.querySelector('.back-to-top');
    // const canvas = document.getElementById('particleCanvas');
    
    // 初始化懒加载
    lazyLoad();
    
    // 初始化文章加载，但不立即更新图片
    loadMoreArticles().then(() => {
        // 等待页面完全加载后再更新图片
        window.onload = async () => {
            await updateArticleImages();
        };
    });
    
    // 返回顶部功能
    if (backToTop) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTop.classList.add('show');
            } else {
                backToTop.classList.remove('show');
            }
        });
        
        backToTop.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    
    // 图片切换功能初始化
    initializeImageSlider();
    
    

    // 加载更多按钮功能
    const loadMoreBtn = document.querySelector('.load-more-btn');
    let currentPage = 1;

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', async () => {
            currentPage++;
            await loadMoreArticles(currentPage);
        });
    }
    
    // 初始化打字机效果
    initializeTypeWriter();
});

