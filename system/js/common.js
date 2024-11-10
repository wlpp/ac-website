// 页面加载管理
document.addEventListener('DOMContentLoaded', function() {
    // 默认加载用户管理页面
    loadPage('user/list');

    // 为菜单项添加点击事件
    document.querySelectorAll('.menu a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            loadPage(page);
            
            // 更新菜单激活状态
            document.querySelectorAll('.menu a').forEach(a => a.classList.remove('active'));
            this.classList.add('active');
        });
    });
});

// 加载页面内容
function loadPage(page) {
    const contentDiv = document.getElementById('mainContent');
    
    // 显示加载状态
    contentDiv.innerHTML = '<div class="loading"></div>';
    
    // 使用XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `/system/${page}.html`, true);
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            contentDiv.innerHTML = xhr.responseText;
            
            // 使用相对路径加载JS
            const scriptPath = `/system/js/${page.split('/')[0]}.js`;
            
            // 移除旧脚本
            const oldScript = document.querySelector(`script[src="${scriptPath}"]`);
            if (oldScript) {
                oldScript.remove();
            }
            
            // 添加新脚本
            const script = document.createElement('script');
            script.src = scriptPath;
            document.body.appendChild(script);
        } else {
            contentDiv.innerHTML = `<div class="error">页面加载失败: ${xhr.status}</div>`;
            console.error('加载失败:', xhr.status);
        }
    };
    
    xhr.onerror = function(e) {
        contentDiv.innerHTML = '<div class="error">页面加载失败</div>';
        console.error('加载错误:', e);
    };
    
    xhr.send();
} 