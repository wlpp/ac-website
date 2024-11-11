/**
 * 图片加载错误处理
 */
function handleImageError(img) {
    img.src = 'https://via.placeholder.com/800x600?text=Image+Not+Found';
    img.alt = '图片加载失败';
}

/**
 * 图片懒加载实现
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
 */
function formatChineseDate(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    return `${year}年${month}月${day}日`;
}

/**
 * 格式化浏览量
 * @param {number} views 浏览量
 * @returns {string} 格式化后的浏览量
 */
function formatViews(views) {
    if (!views && views !== 0) return '0';
    
    if (views >= 10000) {
        return (views / 10000).toFixed(1) + 'w';
    }
    
    return views.toString();
}

/**
 * 渲染游戏卡片
 */
function renderGameCard(article) {
    const gameCard = document.createElement('div');
    gameCard.className = 'game-card';
    
    const formattedDate = formatChineseDate(article.n_date);
    const imageUrl = article.image_url || 'https://via.placeholder.com/800x600?text=No+Image';
    const formattedViews = formatViews(article.views);
    
    const articleUrl = `/article/${article.article_id}?tag=1`;
    
    gameCard.innerHTML = `
        <a href="${articleUrl}" class="game-link">
            <div class="game-image">
                <img data-src="${imageUrl}" 
                     alt="${article.title || '无标题'}"
                     class="loading"
                     src="https://s.nmxc.ltd/sakurairo_vision/@2.6/load_svg/outload.svg#lazyload-blur"
                     onerror="handleImageError(this)">
            </div>
            <div class="game-content">
                <h3 class="game-title">${article.title || '无标题'}</h3>
                <p class="game-desc">${article.content || ''}</p>
                <div class="game-info">
                    <span class="game-views">浏览: ${formattedViews}</span>
                    <span class="game-date">${formattedDate}</span>
                </div>
            </div>
        </a>
    `;
    
    // 添加图片加载完成事件
    const img = gameCard.querySelector('img');
    img.onload = function() {
        this.classList.remove('loading');
        this.classList.add('loaded');
        this.dataset.loaded = 'true';
    };
    
    gameCard.querySelector('.game-link').addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = this.getAttribute('href');
    });
    
    return gameCard;
}

/**
 * 加载更多游戏
 */
async function loadMoreGames(page = 1) {
    const gameSection = document.querySelector('.game-grid');
    const loadMoreBtn = document.querySelector('.load-more-btn');
    
    if (!gameSection) {
        console.error('找不到游戏列表容器(.game-grid)');
        return;
    }
    
    if (loadMoreBtn) {
        loadMoreBtn.textContent = '加载中...';
        loadMoreBtn.disabled = true;
    }
    
    try {
        const API_URL = `/api/articles?page=${page}&tag=1&per_page=12&sort=1`;
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || '加载失败');
        }
        
        let articles = data.data || [];
        
        if (articles.length === 0) {
            if (loadMoreBtn) {
                loadMoreBtn.textContent = '没有更多游戏';
                loadMoreBtn.disabled = true;
            }
            return;
        }
        
        // 渲染游戏卡片
        articles.forEach(article => {
            const gameCard = renderGameCard(article);
            gameSection.appendChild(gameCard);
        });

        // 初始化懒加载
        lazyLoad();
        
        if (loadMoreBtn) {
            loadMoreBtn.textContent = '加载更多';
            loadMoreBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('加载游戏失败:', error);
        if (loadMoreBtn) {
            loadMoreBtn.textContent = '加载失败，点击重试';
            loadMoreBtn.disabled = false;
        }
    }
}

// 主要的 DOMContentLoaded 事件监听器
document.addEventListener('DOMContentLoaded', function() {
    const gameSection = document.querySelector('.game-grid');
    const loadMoreBtn = document.querySelector('.load-more-btn');
    
    if (!gameSection) {
        console.error('找不到游戏列表容器(.game-grid)');
        return;
    }
    
    // 初始化懒加载
    lazyLoad();
    
    // 初始化游戏加载
    loadMoreGames();
    
    // 加载更多按钮功能
    let currentPage = 1;
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', async () => {
            currentPage++;
            await loadMoreGames(currentPage);
        });
    }
});
