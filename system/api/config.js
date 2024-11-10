// 判断当前环境
var hostname = window.location.hostname;
var port = window.location.port;

var isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1' 
                   
               

// 根据环境选择baseURL
var baseURL = isDevelopment ? 'http://127.0.0.1:5000' : 'http://110.41.172.48:5000';

// 将baseURL添加到全局window对象
window.baseURL = baseURL;
// window.baseURL = 'http://110.41.172.48:5000';

