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

// 主要的 DOMContentLoaded 事件监听器
document.addEventListener('DOMContentLoaded', function() {
    const articleSection = document.querySelector('.article-section');
    const backToTop = document.querySelector('.back-to-top');
    
    // 初始化懒加载
    lazyLoad();
    
    // 初始化文章加载
    loadMoreArticles().then(() => {
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
    
    // 加载更多按钮功能
    const loadMoreBtn = document.querySelector('.load-more-btn');
    let currentPage = 1;

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', async () => {
            currentPage++;
            await loadMoreArticles(currentPage);
        });
    }
});

