/**
 * 文章详情页功能
 * 包含文章加载、进度条和返回顶部功能
 */
document.addEventListener('DOMContentLoaded', function() {
    /**
     * 加载文章内容
     * 通过API获取并展示文章详情
     */
    async function loadArticleContent() {
        try {
            const response = await fetch(`${baseURL}/api/article-content/${articleId}`);
            if (!response.ok) {
                throw new Error('文章加载失败');
            }
            
            const data = await response.json();
            
            // 更新页面内容
            titleElement.textContent = data.title;
            contentElement.innerHTML = data.content;
            document.title = `${data.title} - 雨中蚂蚁`;
            
        } catch (error) {
            console.error('加载文章失败:', error);
            titleElement.textContent = '文章加载失败';
            contentElement.textContent = '抱歉，文章加载失败，请稍后重试。';
        }
    }

    /**
     * 更新阅读进度条
     */
    function updateProgressBar() {
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (window.scrollY / totalHeight) * 100;
        progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    /**
     * 控制返回顶部按钮的显示/隐藏
     */
    function toggleBackToTop() {
        if (window.scrollY > 300) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    }

    // 初始化各项功能
    loadArticleContent();
    updateProgressBar();
});
