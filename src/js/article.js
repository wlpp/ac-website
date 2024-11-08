// 调试辅助函数：打印所有 cookie
function printAllCookies() {
    const cookies = document.cookie.split(';');
    console.log('All cookies:');
    cookies.forEach(cookie => {
        console.log(cookie.trim());
    });
}

// 添加加密解密工具函数
function decrypt(encoded) {
    try {
        return decodeURIComponent(atob(encoded));
    } catch (e) {
        console.error('解密失败:', e);
        return null;
    }
}

// 修改 getUserData 函数，使用与 user.js 相同的方式获取用户数据
function getUserData() {
    try {
        const nameEQ = "userData=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                const encryptedData = c.substring(nameEQ.length, c.length);
                const decryptedData = decrypt(encryptedData);
                if (decryptedData) {
                    const userData = JSON.parse(decryptedData);
                    console.log('Found user data:', userData);
                    return userData;
                }
            }
        }
        console.log('No valid user data found in cookies');
        return null;
    } catch (e) {
        console.error('Error getting user data:', e);
        return null;
    }
}

// 测试函数
function testUserData() {
    console.log('Testing user data retrieval:');
    console.log('All cookies:', document.cookie);
    const userData = getUserData();
    console.log('Retrieved user data:', userData);
}

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

    // 获取评论相关元素
    const commentForm = document.querySelector('.comment-form');
    const commentInput = document.querySelector('.comment-input');
    const commentSubmit = document.querySelector('.comment-submit');

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
            document.title = `${data.title} - AC.蚂蚁`;
            
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

    // 处理评论提交
    if (commentSubmit) {
        commentSubmit.addEventListener('click', handleCommentSubmit);
    }

    // 创建自定义弹框
    function createModal(options) {
        // 创建弹框结构
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">${options.title || '提示'}</div>
                <div class="modal-content">${options.content}</div>
                <div class="modal-buttons">
                    <button class="modal-btn secondary" data-action="cancel">
                        ${options.cancelText || '取消'}
                    </button>
                    <button class="modal-btn primary" data-action="confirm">
                        ${options.confirmText || '确认'}
                    </button>
                </div>
            </div>
        `;

        // 添加到页面
        document.body.appendChild(modal);

        // 显示弹框
        setTimeout(() => modal.classList.add('show'), 10);

        // 绑定事件
        return new Promise((resolve) => {
            modal.addEventListener('click', (e) => {
                const target = e.target;
                if (target.classList.contains('modal-overlay') || 
                    target.closest('[data-action]')) {
                    const action = target.closest('[data-action]')?.dataset.action;
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.remove();
                        resolve(action === 'confirm');
                    }, 300);
                }
            });
        });
    }

    // 修改评论提交处理函数
    async function handleCommentSubmit() {
        try {
            const userData = getUserData();
            console.log('User data for comment:', userData);

            // 检查用户是否登录（使用 token 验证）
            if (!userData || !userData.token) {
                const confirmed = await createModal({
                    title: '提示',
                    content: '需要登录才能发表评论，是否前往登录？',
                    confirmText: '前往登录',
                    cancelText: '取消'
                });

                if (confirmed) {
                    window.location.href = '/login';
                }
                return;
            }

            // 已登录，检查评论内容
            const content = commentInput.value.trim();
            if (!content) {
                alert('评论内容不能为空');
                return;
            }

            // 发送评论数据
            const commentData = {
                article_id: articleId,
                content: content,
                username: userData.username,
                parent_id: currentReplyId ? parseInt(currentReplyId) : null
            };

            console.log('Sending comment data:', commentData);

            const response = await fetch(`${baseURL}/api/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userData.token}`
                },
                body: JSON.stringify(commentData)
            });

            const data = await response.json();
            console.log('Response:', data);

            if (!response.ok) {
                throw new Error(data.message || '发表评论失败');
            }

            if (data.success) {
                commentInput.value = '';
                commentSubmit.classList.remove('active');
                currentReplyId = null;
                loadComments();  // 重新加载评论列表
                alert('评论发表成功！');
            }
        } catch (error) {
            console.error('发表评论失败:', error);
            alert(error.message || '发表评论失败，请稍后重试');
        }
    }

    // 处理回复点击
    let currentReplyId = null;
    function handleReplyClick(e) {
        const commentItem = e.target.closest('.comment-item');
        currentReplyId = commentItem.dataset.id;
        
        commentInput.focus();
        commentInput.placeholder = `回复 ${commentItem.querySelector('.comment-username').textContent}`;
    }

    // 格式化评论时间
    function formatCommentTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 30) return `${days}天前`;
        
        return date.toLocaleDateString();
    }

    // 加载评论列表
    async function loadComments() {
        try {
            const response = await fetch(`${baseURL}/api/comments/${articleId}`);
            if (!response.ok) throw new Error('加载评论失败');
            
            const data = await response.json();
            if (data.success) {
                renderComments(data.data);
            }
        } catch (error) {
            console.error('加载评论失败:', error);
        }
    }

    // 渲染评论列表
    function renderComments(comments) {
        const commentList = document.querySelector('.comment-list');
        if (!commentList) return;

        commentList.innerHTML = comments.map(comment => `
            <li class="comment-item" data-id="${comment.id}">
                <img class="comment-avatar" src="../images/avatar.jpg" alt="用户头像">
                <div class="comment-content">
                    <div class="comment-header">
                        <div class="comment-username">${comment.username}</div>
                        <span class="comment-time">${formatCommentTime(comment.created_at)}</span>
                    </div>
                    <div class="comment-text">
                        ${comment.content}
                    </div>
                    <div class="comment-actions">
                        <span class="comment-action reply-btn">回复</span>
                    </div>
                    ${comment.parent_id ? '<div class="reply-indicator">回复评论</div>' : ''}
                </div>
            </li>
        `).join('');

        // 绑定回复按钮事件
        document.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', handleReplyClick);
        });
    }

    // 监听输入框内容变化
    if (commentInput && commentSubmit) {
        // 移除旧的事件监听器（如果有的话）
        commentInput.removeEventListener('input', handleCommentInput);
        
        // 添加新的事件监听器
        commentInput.addEventListener('input', handleCommentInput);
        
        // 初始检查输入框状态
        handleCommentInput.call(commentInput);
    }

    // 输入框内容变化处理函数
    function handleCommentInput() {
        const hasContent = this.value.trim().length > 0;
        if (hasContent) {
            commentSubmit.classList.add('active');
        } else {
            commentSubmit.classList.remove('active');
        }
        // 调试输出
        console.log('Input value changed:', this.value, 'Has content:', hasContent);
    }
    // 初始化
    loadArticleContent();
    loadComments();
    updateProgressBar();
});

