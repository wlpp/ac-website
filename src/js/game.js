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
 * 渲染游戏卡片
 */
function renderGameCard(article) {
    const gameCard = document.createElement('div');
    gameCard.className = 'game-card';
    
    const formattedDate = formatChineseDate(article.n_date);
    
    gameCard.innerHTML = `
        <a href="/article/${article.article_id}" class="game-link">
            <div class="game-image">
                <img data-src="https://s.nmxc.ltd/sakurairo_vision/@2.6/load_svg/outload.svg#lazyload-blur" 
                     alt="${article.title || '无标题'}"
                     class="loading"
                     src="https://s.nmxc.ltd/sakurairo_vision/@2.6/load_svg/outload.svg#lazyload-blur">
            </div>
            <div class="game-content">
                <h3 class="game-title">${article.title || '无标题'}</h3>
                <p class="game-desc">${article.content || '暂无内容'}</p>
                <div class="game-info">
                    <span class="game-views">浏览: ${article.views || 0}</span>
                    <span class="game-date">${formattedDate}</span>
                </div>
            </div>
        </a>
    `;
    
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
    
    if (loadMoreBtn) {
        loadMoreBtn.textContent = '加载中...';
        loadMoreBtn.disabled = true;
    }
    
    try {
        const API_URL = `${baseURL}/api/articles?page=${page}&tag=1`;
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
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

        // 重新初始化懒加载
        lazyLoad();
        
        // 更新新加载的游戏卡片图片
        await updateGameImages();
        
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

/**
 * 更新游戏卡片图片
 */
async function updateGameImages() {
    try {
        const gameImages = document.querySelectorAll('.game-card .game-image img:not([data-updated="true"])');
        if (gameImages.length === 0) return;
        
        const loadingImageUrl = 'https://s.nmxc.ltd/sakurairo_vision/@2.6/load_svg/outload.svg#lazyload-blur';
        gameImages.forEach(img => {
            img.classList.add('loading');
            img.src = loadingImageUrl;
        });
        
        const response = await fetch(`/api/random-image?count=${gameImages.length}`);
        const data = await response.json();
        
        if (data.success && data.data.image_urls) {
            gameImages.forEach((img, index) => {
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
        console.error('更新游戏图片失败:', error);
        gameImages.forEach(img => {
            img.src = 'https://via.placeholder.com/800x600?text=Load+Failed';
            img.classList.remove('loading');
            img.classList.add('error');
        });
    }
}

// 主要的 DOMContentLoaded 事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // 初始化懒加载
    lazyLoad();
    
    // 初始化游戏加载
    loadMoreGames().then(() => {
        window.onload = async () => {
            await updateGameImages();
        };
    });
    
    // 加载更多按钮功能
    const loadMoreBtn = document.querySelector('.load-more-btn');
    let currentPage = 1;

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', async () => {
            currentPage++;
            await loadMoreGames(currentPage);
        });
    }
});
