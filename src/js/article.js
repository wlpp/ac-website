// 定义 baseURL
const baseURL = ''; // 如果是相对路径，可以留空

// 获取用户数据函数
function getUserData() {
    try {
        // 从 cookie 中获取用户数据
        const userDataCookie = document.cookie
            .split('; ')
            .find(row => row.startsWith('userData='));
            
        if (!userDataCookie) {
            debug.log('No userData cookie found');
            return null;
        }

        // 获取 cookie 值
        const encodedData = userDataCookie.split('=')[1];
        
        // Base64 解码
        const base64Decoded = atob(encodedData);
        
        // URL 解码
        const urlDecoded = decodeURIComponent(base64Decoded);
        
        // 解析 JSON 数据
        const userData = JSON.parse(urlDecoded);
        
        // 验证必要的字段是否存在
        if (!userData || !userData.token || !userData.username) {
            debug.log('Invalid user data structure:', userData);
            return null;
        }

        return userData;
    } catch (error) {
        console.error('获取用户数据失败:', error);
        // 输出更详细的错误信息用于调试
        if (error instanceof SyntaxError) {
            const userDataCookie = document.cookie
                .split('; ')
                .find(row => row.startsWith('userData='));
            if (userDataCookie) {
                const encodedData = userDataCookie.split('=')[1];
                debug.log('原始编码数据:', encodedData);
                try {
                    const decodedOnce = decodeURIComponent(encodedData);
                    debug.log('第一次解码:', decodedOnce);
                    const decodedTwice = decodeURIComponent(decodedOnce);
                    debug.log('第二次解码:', decodedTwice);
                } catch (e) {
                    debug.log('解码过程出错:', e);
                }
            }
        }
        return null;
    }
}

// Cookie 操作辅助函数
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        return parts.pop().split(';').shift();
    }
    return null;
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
    const commentInput = document.querySelector('.comment-input');
    const commentSubmit = document.querySelector('.comment-submit');
    const modalOverlay = document.querySelector('.modal-overlay');

    // 添加回复ID变量
    let currentReplyId = null;  // 在这里定义变量

    // 获取 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    const tag = urlParams.get('tag');
    
    // 获取元素
    const disclaimer = document.querySelector('.article-disclaimer');
    const source = document.querySelector('.articleSource');
    
    // 根据 tag 参数控制显示
    if (disclaimer && source) {
        if (tag === '1') {
            disclaimer.style.display = 'block';
            source.style.display = 'none';
        } else {
            disclaimer.style.display = 'none';
            source.style.display = 'block';
        }
    }

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
            
            // 根据 tag 参数控制显示和加载游戏下载信息
            if (tag === '1') {
                try {
                    const downloadResponse = await fetch(`${baseURL}/api/game-download/${articleId}`);
                    const downloadData = await downloadResponse.json();
                    
                    if (downloadResponse.ok && downloadData.success) {
                        // 创建下载信息 HTML
                        const downloadHtml = `
                            <div class="tbcm-content">
                                <p>游戏名称：${data.title}</p>
                                <hr>
                                ${downloadData.data.code ? `<p>网盘提取码：${downloadData.data.code}</p><hr>` : ''}
                                ${downloadData.data.decryption ? `<p>解压密码：${downloadData.data.decryption}</p>` : ''}
                            </div>
                            <div class="tbcm-down" style="margin-top: 10px;">
                                <a href="${downloadData.data.url}" class="download-btn" target="_blank">点击下载游戏</a>
                            </div>
                        `;
                        
                        // 在文章内容后添加下载信息
                        contentElement.insertAdjacentHTML('beforeend', downloadHtml);
                    } else {
                        console.warn('游戏下载信息获取失败:', downloadData.message);
                        message.warning(downloadData.message || '游戏下载信息获取失败');
                    }
                } catch (error) {
                    console.error('加载游戏下载信息失败:', error);
                    message.error('加载游戏下载信息失败，请稍后重试');
                }
                
                // 显示免责声明
                if (disclaimer && source) {
                    disclaimer.style.display = 'block';
                    source.style.display = 'none';
                }
            } else {
                // 显示来源信息
                if (disclaimer && source) {
                    disclaimer.style.display = 'none';
                    source.style.display = 'block';
                }
            }
            
        } catch (error) {
            console.error('加载文章失败:', error);
            message.error('文章加载失败，请稍后重试');
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
            debug.log('User data for comment:', userData);

            // 检查用户是否登录
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

            // 检查评论内容
            const content = commentInput.value.trim();
            if (!content) {
                message.warning('评论内容不能为空');
                return;
            }

            // 获取当前回复的评论元素
            const replyToComment = currentReplyId ? 
                document.querySelector(`.comment-card[data-id="${currentReplyId}"]`) : null;

            // 发送评论数据
            const commentData = {
                article_id: articleId,
                content: content,
                user_id: userData.user_id,
                username: userData.username,
                parent_id: currentReplyId ? parseInt(currentReplyId) : null
            };

            debug.log('Sending comment data:', commentData);

            const response = await fetch(`${baseURL}/api/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userData.token}`
                },
                body: JSON.stringify(commentData)
            });

            const data = await response.json();
            debug.log('Response:', data);

            if (!response.ok) {
                throw new Error(data.message || '发表评论失败');
            }

            if (data.success) {
                // 重置评论表单
                commentInput.value = '';
                commentInput.placeholder = '写下你的评论...';  // 重置占位符
                commentSubmit.classList.remove('active');
                currentReplyId = null;  // 重置回复ID
                loadComments();  // 重新加载评论列表
                message.success('评论发表成功！');
            }
        } catch (error) {
            console.error('发表评论失败:', error);
            message.error(error.message || '发表评论失败，请稍后重试');
        }
    }

    // 修改处理回复点击的函数
    function handleReplyClick(e) {
        e.preventDefault();
        e.stopPropagation();

        // 查找最近的评论卡片元素
        const commentCard = e.target.closest('.comment-card');
        if (!commentCard) {
            console.error('未找到评论卡片元素');
            return;
        }

        // 获取被回复评论的信息
        currentReplyId = commentCard.dataset.id;
        
        // 获取评论用户名
        const username = commentCard.querySelector('.comment-username').textContent;
        
        // 更新输入框占位符
        commentInput.placeholder = `回复 ${username}：`;
        commentInput.focus();

        // 滚动到评论框
        const commentSection = document.querySelector('.comment-section');
        if (commentSection) {
            commentSection.scrollIntoView({ behavior: 'smooth' });
            
            // 添加高亮效果
            commentInput.classList.add('replying');
            setTimeout(() => {
                commentInput.classList.remove('replying');
            }, 1000);
        }
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
            const data = await response.json();
            
            if (response.ok && data.success) {
                debug.log('评论数据:', data);
                renderComments(data.data);
            } else {
                console.error('加载评论失败:', data.message);
                message.error('加载评论失败');
            }
        } catch (error) {
            console.error('加载评论失败:', error);
            message.error('加载评论失败，请稍后重试');
        }
    }

    // 修改渲染评论列表函数
    function renderComments(comments) {
        const commentList = document.querySelector('.comment-list');
        if (!commentList) return;

        if (!comments || comments.length === 0) {
            commentList.innerHTML = '<div class="no-comments">暂无评论</div>';
            return;
        }

        // 直接使用后端返回的树形结构
        commentList.innerHTML = comments.map(comment => renderCommentWithReplies(comment)).join('');

        // 绑定回复按钮事件
        document.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', handleReplyClick);
        });
    }

    // 修改渲染单个评论及其回复的函数
    function renderCommentWithReplies(comment) {
        return `
            <div class="comment-card" data-id="${comment.id}" ${comment.parent_id ? `data-parent-id="${comment.parent_id}"` : ''}>
                <div class="comment-card-header">
                    <img class="comment-avatar" src="../images/avatar.webp" alt="用户头像">
                    <div class="comment-info">
                        <div class="comment-username">${comment.username}</div>
                        <div class="comment-time">${formatCommentTime(comment.created_at)}</div>
                    </div>
                </div>
                <div class="comment-card-body">
                    <div class="comment-text">
                        ${comment.reply_to ? `<span class="reply-to">回复 ${comment.reply_to}：</span>` : ''}
                        ${comment.content}
                    </div>
                </div>
                <div class="comment-card-footer">
                    <span class="comment-action reply-btn">
                        <i class="fas fa-reply"></i> 回复
                    </span>
                </div>
                ${comment.children && comment.children.length > 0 ? `
                    <div class="comment-replies">
                        ${comment.children.map(reply => renderCommentWithReplies(reply)).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // 监听输入框内容变化
    if (commentInput && commentSubmit) {
        // 移除旧的事件监听器（如果有的话）
        commentInput.removeEventListener('input', handleCommentInput);
        
        // 添加新的事件监听器
        commentInput.addEventListener('input', handleCommentInput);
        
        // 初始检查入框状态
        handleCommentInput.call(commentInput);
    }

    // 输框内容变化处理函数
    function handleCommentInput() {
        const hasContent = this.value.trim().length > 0;
        if (hasContent) {
            commentSubmit.classList.add('active');
        } else {
            commentSubmit.classList.remove('active');
        }
        // 调试输出
        debug.log('Input value changed:', this.value, 'Has content:', hasContent);
    }

    // 检查用户登录状态并处理评论输入
    function handleCommentAccess() {
        const userData = getUserData(); // 使 user.js 中的函数获取用户数据

        if (!userData) {
            // 未登录状态下点击输入框显示登录提示
            commentInput.addEventListener('focus', showLoginModal);
            commentSubmit.addEventListener('click', showLoginModal);
        } else {
            // 已登录状态下移除登录提示事件
            commentInput.removeEventListener('focus', showLoginModal);
            commentSubmit.removeEventListener('click', showLoginModal);
        }
    }

    // 显示登录提示 Modal
    function showLoginModal(e) {
        e.preventDefault();
        modalOverlay.style.display = 'block';
        
        // 移除输入框点
        commentInput.blur();
    }

    // 处理 Modal 按钮点击
    if (modalOverlay) {
        const loginBtn = modalOverlay.querySelector('.login-btn');
        const cancelBtn = modalOverlay.querySelector('.cancel-btn');

        loginBtn.addEventListener('click', () => {
            window.location.href = '/login';
        });

        cancelBtn.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });

        // 点击遮罩层关闭 Modal
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
            }
        });
    }

    // 初始化时检查用户登录状态
    handleCommentAccess();

    // 初始化
    loadArticleContent();
    loadComments();
    updateProgressBar();
});

