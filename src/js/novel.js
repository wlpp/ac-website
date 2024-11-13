document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const toggleMenuBtn = document.getElementById('toggleMenu');
    const sidebar = document.getElementById('sidebar');
    const toggleThemeBtn = document.getElementById('toggleTheme');
    const decreaseFontBtn = document.getElementById('decreaseFont');
    const increaseFontBtn = document.getElementById('increaseFont');
    const contentArea = document.getElementById('contentArea');
    const searchBtn = document.getElementById('searchBtn');
    const searchModal = document.getElementById('searchModal');
    const closeSearch = document.getElementById('closeSearch');
    const searchInput = document.getElementById('searchInput');
    const doSearch = document.getElementById('doSearch');
    const searchResults = document.getElementById('searchResults');
    const loadingModal = document.getElementById('loadingModal');
    const prevChapterBtn = document.getElementById('prevPage');
    const nextChapterBtn = document.getElementById('nextPage');
    
    // 侧边栏切换
    toggleMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    // 主题切换
    let isDarkMode = false;
    toggleThemeBtn.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        toggleThemeBtn.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });

    // 字体大小调节
    let fontSize = 1.1;
    const fontSizeStep = 0.1;
    
    increaseFontBtn.addEventListener('click', () => {
        if (fontSize < 1.5) {
            fontSize += fontSizeStep;
            updateFontSize();
        }
    });

    decreaseFontBtn.addEventListener('click', () => {
        if (fontSize > 0.8) {
            fontSize -= fontSizeStep;
            updateFontSize();
        }
    });

    function updateFontSize() {
        document.querySelector('.chapter-content').style.fontSize = `${fontSize}rem`;
    }

    // 点击内容区域时关闭侧边栏（移动端适配）
    contentArea.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
        }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case 'ArrowLeft':
                // 上一章
                if (!prevChapterBtn.disabled) {
                    handlePrevChapter();
                }
                break;
            case 'ArrowRight':
                // 下一章
                if (!nextChapterBtn.disabled) {
                    handleNextChapter();
                }
                break;
            case 'm':
            case 'M':
                // 切换菜单
                toggleMenuBtn.click();
                break;
        }
    });

    // 保存阅读进度
    function saveReadingProgress() {
        const progress = {
            chapter: document.querySelector('.book-title').textContent,
            scrollPosition: window.scrollY
        };
        localStorage.setItem('readingProgress', JSON.stringify(progress));
    }

    // 恢复阅读进度
    function loadReadingProgress() {
        const progress = JSON.parse(localStorage.getItem('readingProgress'));
        if (progress) {
            window.scrollTo(0, progress.scrollPosition);
        }
    }

    // 监听滚动事件，保存阅读进度
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(saveReadingProgress, 100);
    });

    // 页面加载时恢复进度
    loadReadingProgress();

    // 打开搜索弹框
    searchBtn.addEventListener('click', () => {
        searchModal.classList.add('active');
        searchInput.focus();
    });

    // 关闭搜索弹框 - 只通过关闭按钮关闭
    closeSearch.addEventListener('click', () => {
        searchModal.classList.remove('active');
    });

    // 执行搜索
    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        try {
            searchResults.innerHTML = '<div class="search-item">搜索中...</div>';

            const response = await fetch(`/api/novel-search?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data.success) {
                searchResults.innerHTML = '';

                if (data.data.length === 0) {
                    searchResults.innerHTML = '<div class="search-item">未找到相关结果</div>';
                    return;
                }

                // 创建搜索结果元素
                data.data.forEach(item => {
                    const searchItem = document.createElement('div');
                    searchItem.className = 'search-item';
                    searchItem.dataset.id = item.id;

                    const coverDiv = document.createElement('div');
                    coverDiv.className = 'search-item-cover';
                    
                    const img = document.createElement('img');
                    img.src = item.cover_url;
                    img.alt = item.title;
                    img.onerror = () => { img.src = '默认图片URL'; };
                    
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'search-item-info';
                    
                    const title = document.createElement('h4');
                    title.textContent = item.title;
                    
                    const desc = document.createElement('p');
                    desc.textContent = item.description || '暂无简介';

                    // 组装元素
                    coverDiv.appendChild(img);
                    infoDiv.appendChild(title);
                    infoDiv.appendChild(desc);

                    searchItem.appendChild(coverDiv);
                    searchItem.appendChild(infoDiv);

                    // 修改点击事件处理
                    searchItem.addEventListener('click', async () => {
                        try {
                            // 关闭搜索弹框
                            searchModal.classList.remove('active');
                            
                            // 清空搜索输入
                            searchInput.value = '';
                            
                            // 清除上一本书的阅读进度
                            localStorage.removeItem('lastChapterId');
                            localStorage.removeItem('readingProgress');
                            
                            // 加载新书的章节列表，并自动加载第一章
                            await loadNovel(item.id);
                            
                            // 在移动端自动关闭侧边栏
                            if (window.innerWidth <= 768) {
                                sidebar.classList.remove('active');
                            }
                        } catch (error) {
                            console.error('加载小说失败:', error);
                            alert('加载小说失败，请稍后重试');
                        }
                    });

                    searchResults.appendChild(searchItem);
                });
            } else {
                searchResults.innerHTML = `<div class="search-item">搜索失败: ${data.message}</div>`;
            }
        } catch (error) {
            console.error('搜索出错:', error);
            searchResults.innerHTML = '<div class="search-item">搜索出错，请稍后重试</div>';
        }
    }

    // 搜索按钮点击事件
    doSearch.addEventListener('click', performSearch);

    // 搜索输入框回车事件
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // 加载小说函数
    async function loadNovel(id) {
        try {
            // 加载章节列表
            const chaptersResponse = await fetch(`/api/novel-chapters?id=${id}`);
            const chaptersData = await chaptersResponse.json();

            if (chaptersData.success) {
                // 获取章节列表容器
                const chapterList = document.querySelector('.chapter-list');
                
                // 清空现有章节列表
                chapterList.innerHTML = '';
                
                // 创建并添加新的章节元素
                const chapterElements = chaptersData.data.map(chapter => {
                    const div = document.createElement('div');
                    div.className = 'chapter-item';
                    div.dataset.id = chapter.id;
                    div.innerHTML = `<span class="chapter-title">${chapter.chapter}</span>`;
                    
                    div.addEventListener('click', () => {
                        loadChapterContent(chapter.id);
                        if (window.innerWidth <= 768) {
                            sidebar.classList.remove('active');
                        }
                    });
                    
                    return div;
                });
                
                // 一次性添加所有章节元素
                chapterList.append(...chapterElements);

                // 保存当前小说ID
                localStorage.setItem('currentNovelId', id);
                
                // 直接加载第一章
                const firstChapter = chaptersData.data[0];
                if (firstChapter) {
                    loadChapterContent(firstChapter.id);
                }
            } else {
                alert('加载章节列表失败: ' + chaptersData.message);
            }
        } catch (error) {
            console.error('加载小说出错:', error);
            alert('加载小说出错，请稍后重试');
        }
    }

    // 添加显示和隐藏 loading 的辅助函数
    function showLoading() {
        loadingModal.classList.add('active');
    }

    function hideLoading() {
        loadingModal.classList.remove('active');
    }

    // 修改加载章节内容的函数
    async function loadChapterContent(chapterId) {
        try {
            // 显示 loading
            showLoading();

            const response = await fetch(`/api/novel-content?id=${chapterId}`);
            const data = await response.json();

            if (data.success) {
                // 更新小说内容
                document.querySelector('.book-title').textContent = data.data.title;
                document.querySelector('.chapter-content').innerHTML = data.data.content
                    .map(para => `<p>${para}</p>`)
                    .join('');
                
                // 保存当前章节ID
                localStorage.setItem('lastChapterId', chapterId);
                
                // 高亮当前章节并更新按钮状态
                document.querySelectorAll('.chapter-item').forEach(item => {
                    item.classList.remove('active');
                    if (item.dataset.id === chapterId) {
                        item.classList.add('active');
                        // 滚动到当前章节位置
                        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // 更新翻页按钮状态
                        const allChapters = document.querySelectorAll('.chapter-item');
                        const currentIndex = Array.from(allChapters).indexOf(item);
                        
                        // 禁用或启用翻页按钮
                        prevChapterBtn.disabled = currentIndex === 0;
                        nextChapterBtn.disabled = currentIndex === allChapters.length - 1;
                    }
                });
                
                // 重置滚动位置
                window.scrollTo(0, 0);
            } else {
                alert('加载章节内容失败: ' + data.message);
            }
        } catch (error) {
            console.error('加载章节内容出错:', error);
            alert('加载章节内容出错，请稍后重试');
        } finally {
            // 无论成功还是失败，都隐藏 loading
            hideLoading();
        }
    }

    // 添加上一章和下一章的事件处理函数
    function handlePrevChapter() {
        const currentChapter = document.querySelector('.chapter-item.active');
        if (currentChapter) {
            const prevChapter = currentChapter.previousElementSibling;
            if (prevChapter && prevChapter.classList.contains('chapter-item')) {
                loadChapterContent(prevChapter.dataset.id);
            } else {
                alert('已经是第一章了');
            }
        }
    }

    function handleNextChapter() {
        const currentChapter = document.querySelector('.chapter-item.active');
        if (currentChapter) {
            const nextChapter = currentChapter.nextElementSibling;
            if (nextChapter && nextChapter.classList.contains('chapter-item')) {
                loadChapterContent(nextChapter.dataset.id);
            } else {
                alert('已经是最后一章了');
            }
        }
    }

    // 添加按钮点击事件监听器
    prevChapterBtn.addEventListener('click', handlePrevChapter);
    nextChapterBtn.addEventListener('click', handleNextChapter);
});