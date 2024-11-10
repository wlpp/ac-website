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
            // 更新内容
            contentDiv.innerHTML = xhr.responseText;
            
            // 加载对应的JS文件
            const scriptPath = `/system/js/${page.split('/')[0]}.js`;
            loadScript(scriptPath);
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

// 添加新的函数来加载脚本
function loadScript(src) {
    // 移除旧脚本
    const oldScript = document.querySelector(`script[src="${src}"]`);
    if (oldScript) {
        oldScript.remove();
    }
    
    // 添加新脚本
    const script = document.createElement('script');
    script.src = src;
    script.onload = function() {
        // 脚本加载完成后，如果有初始化函数就调用它
        if (typeof initPage === 'function') {
            initPage();
        }
    };
    document.body.appendChild(script);
} 