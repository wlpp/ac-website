document.addEventListener('DOMContentLoaded', function() {
    // 从 URL 获取文章 ID
    const pathParts = window.location.pathname.split('/');
    const articleId = pathParts[pathParts.length - 1];

    // 获取页面元素
    const titleElement = document.querySelector('.article-title');
    const dateElement = document.getElementById('articleDate');
    const contentElement = document.querySelector('.article-body');
    const backToTop = document.querySelector('.back-to-top');
    const progressBar = document.querySelector('.progress-bar');

    // 加载文章内容
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

    // 更新进度条
    function updateProgressBar() {
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (window.scrollY / totalHeight) * 100;
        progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    // 返回顶部按钮显示/隐藏
    function toggleBackToTop() {
        if (window.scrollY > 300) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    }

    // 返回顶部功能
    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // 添加滚动事件监听
    window.addEventListener('scroll', () => {
        updateProgressBar();
        toggleBackToTop();
    }, { passive: true });

    // 初始化
    loadArticleContent();
    updateProgressBar();
});
