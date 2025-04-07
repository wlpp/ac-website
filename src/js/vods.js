// 模拟视频数据
const vodData = {
    featured: [],
    new: []
};

// 创建视频卡片元素
function createVodCard(vod) {
    // 从 vod.link 中提取 vid
    const vid = vod.link.match(/\d+/)[0];
    console.log(vid)
    // 从 vod.note 中提取数字作为 episodes
    const episodesMatch = vod.note.match(/\d+/); // 匹配第一个数字
    const episodes = episodesMatch ? episodesMatch[0] : ''; // 如果找到数字，则使用，否则为空

    // 编码标题
    const title = encodeURIComponent(vod.title);

    return `
        <div class="vod-card" data-id="${vod.id}" onclick="location.href='/vodplay?vid=${vid}&episodes=${episodes}&title=${title}'">
            <img class="vod-cover" data-src="${vod.img}" alt="${vod.title}" src="https://tuchuang.voooe.cn/images/2022/05/08/26073943_nCX5.gif">
            <span class="update-badge">${vod.note}</span>
            <div class="vod-title">${vod.title}</div>
        </div>
    `;
}

// 懒加载函数
function lazyLoadImages() {
    const images = document.querySelectorAll('.vod-cover');

    const options = {
        root: null, // 使用视口作为根元素
        rootMargin: '0px',
        threshold: 0.1 // 当10%可见时触发
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.getAttribute('data-src');
                img.src = src; // 设置真实的图片源
                img.classList.add('loaded'); // 可选：添加加载完成的类
                observer.unobserve(img); // 停止观察
            }
        });
    }, options);

    images.forEach(img => {
        observer.observe(img); // 开始观察每个图片
    });
}

// 获取热门视频数据并渲染
async function fetchFeaturedVods(page = 1) {
    try {
        const response = await fetch(`/api/vods-anime?page=${page}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();

        if (data.success) {
            const featuredContainer = document.getElementById('featuredVods');
            featuredContainer.innerHTML = data.data
                .map(vod => createVodCard(vod))
                .join('');
            lazyLoadImages(); // 调用懒加载函数
        } else {
            console.error('获取热门视频失败:', data.message);
        }
    } catch (error) {
        console.error('请求失败:', error);
    }
}

// 获取新片数据并渲染
async function fetchNewVods(page = 1) {
    try {
        const response = await fetch(`/api/vods-anime?page=${page}&type=1`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();

        if (data.success) {
            const newContainer = document.getElementById('newVods');
            newContainer.innerHTML = data.data
                .map(vod => createVodCard(vod))
                .join('');
            
            lazyLoadImages(); // 确保调用懒加载函数
        } else {
            console.error('获取新片失败:', data.message);
        }
    } catch (error) {
        console.error('请求失败:', error);
    }
}

// 初始化页面内容
function initializePage() {
    // 加载推荐内容
    fetchFeaturedVods(); // 默认加载第一页的热门视频

    // 加载最新内容
    fetchNewVods(); // 加载新片上线
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
    initializeSearch();
});
