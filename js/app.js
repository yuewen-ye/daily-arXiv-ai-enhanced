let currentDate = '';
let availableDates = [];
let recommendationMode = localStorage.getItem('recommendationMode') === 'zotero' ? 'zotero' : 'original';
let currentView = 'grid'; // 'grid' 或 'list'
let currentCategory = new URLSearchParams(window.location.search).get('viewCategory') || 'all';
let urlCategoryParam = null; // 从URL参数中获取的category
let urlJsonParam = null; // 从URL参数中获取的json（API模式）
let urlAuthorParam = null; // 从URL参数中获取的author
let urlKeywordsParam = null; // 从URL参数中获取的keywords
let paperData = {};
let flatpickrInstance = null;
let isRangeMode = false;
let activeKeywords = []; // 存储激活的关键词
let userKeywords = []; // 存储用户的关键词
let activeAuthors = []; // 存储激活的作者
let userAuthors = []; // 存储用户的作者
let currentPaperIndex = 0; // 当前查看的论文索引
let currentFilteredPapers = []; // 当前过滤后的论文列表
let textSearchQuery = ''; // 实时文本搜索查询
let lastDetailFocus = null;
let onlySearchMatches = false;
let paperLoadVersion = 0;
let papersLoading = false;
let selectedDateBounds = [];
let readingView = 'unread';
const readingStore = ReadingQueue.create(() => localStorage, DATA_CONFIG.demo ? 'demo' : 'personal');

// 加载用户的关键词设置
function loadUserKeywords() {
  const savedKeywords = localStorage.getItem('preferredKeywords');
  if (savedKeywords) {
    try {
      userKeywords = JSON.parse(savedKeywords);
      // 默认激活所有关键词
      activeKeywords = [...userKeywords];
    } catch (error) {
      console.error('解析关键词失败:', error);
      userKeywords = [];
      activeKeywords = [];
    }
  } else {
    userKeywords = [];
    activeKeywords = [];
  }
  
  // renderKeywordTags();
  renderFilterTags();
}

// 加载用户的作者设置
function loadUserAuthors() {
  const savedAuthors = localStorage.getItem('preferredAuthors');
  if (savedAuthors) {
    try {
      userAuthors = JSON.parse(savedAuthors);
      // 默认激活所有作者
      activeAuthors = [...userAuthors];
    } catch (error) {
      console.error('解析作者失败:', error);
      userAuthors = [];
      activeAuthors = [];
    }
  } else {
    userAuthors = [];
    activeAuthors = [];
  }
  
  renderFilterTags();
}

// 渲染过滤标签（作者和关键词）
function renderFilterTags() {
  const filterTagsElement = document.getElementById('filterTags');
  const filterContainer = document.querySelector('.filter-label-container');
  
  // 搜索位于主导航；没有偏好标签时隐藏整行。
  if ((!userAuthors || userAuthors.length === 0) && (!userKeywords || userKeywords.length === 0)) {
    filterContainer.style.display = 'none';
    if (filterTagsElement) {
      filterTagsElement.style.display = 'none';
      filterTagsElement.innerHTML = '';
    }
    return;
  }
  
  filterContainer.style.display = 'flex';
  if (filterTagsElement) {
    filterTagsElement.style.display = 'flex';
  }
  filterTagsElement.innerHTML = '';
  
  // 先添加作者标签
  if (userAuthors && userAuthors.length > 0) {
    userAuthors.forEach(author => {
      const tagElement = document.createElement('span');
      tagElement.className = `category-button author-button ${activeAuthors.includes(author) ? 'active' : ''}`;
      tagElement.textContent = author;
      tagElement.dataset.author = author;
      tagElement.title = "匹配作者姓名";
      
      tagElement.addEventListener('click', () => {
        toggleAuthorFilter(author);
      });
      
      filterTagsElement.appendChild(tagElement);
      
      // 添加出现动画后移除动画类
      if (!activeAuthors.includes(author)) {
        tagElement.classList.add('tag-appear');
        setTimeout(() => {
          tagElement.classList.remove('tag-appear');
        }, 300);
      }
    });
  }
  
  // 再添加关键词标签
  if (userKeywords && userKeywords.length > 0) {
    userKeywords.forEach(keyword => {
      const tagElement = document.createElement('span');
      tagElement.className = `category-button keyword-button ${activeKeywords.includes(keyword) ? 'active' : ''}`;
      tagElement.textContent = keyword;
      tagElement.dataset.keyword = keyword;
      tagElement.title = "匹配标题和摘要中的关键词";
      
      tagElement.addEventListener('click', () => {
        toggleKeywordFilter(keyword);
      });
      
      filterTagsElement.appendChild(tagElement);
      
      // 添加出现动画后移除动画类
      if (!activeKeywords.includes(keyword)) {
        tagElement.classList.add('tag-appear');
        setTimeout(() => {
          tagElement.classList.remove('tag-appear');
        }, 300);
      }
    });
  }
}

// 切换关键词过滤
function toggleKeywordFilter(keyword) {
  const index = activeKeywords.indexOf(keyword);
  
  if (index === -1) {
    // 激活该关键词
    activeKeywords.push(keyword);
  } else {
    // 取消激活该关键词
    activeKeywords.splice(index, 1);
  }
  
  // 更新关键词标签UI
  const keywordTags = document.querySelectorAll('[data-keyword]');
  keywordTags.forEach(tag => {
    if (tag.dataset.keyword === keyword) {
      // 先移除上一次可能的高亮动画
      tag.classList.remove('tag-highlight');
      
      // 添加/移除激活状态
      tag.classList.toggle('active', activeKeywords.includes(keyword));
      
      // 添加高亮动画
      setTimeout(() => {
        tag.classList.add('tag-highlight');
      }, 10);
      
      // 移除高亮动画
      setTimeout(() => {
        tag.classList.remove('tag-highlight');
      }, 1000);
    }
  });
  
  // 重新渲染论文列表
  renderPapers();
}


// 切换作者过滤
function toggleAuthorFilter(author) {
  const index = activeAuthors.indexOf(author);
  
  if (index === -1) {
    // 激活该作者
    activeAuthors.push(author);
  } else {
    // 取消激活该作者
    activeAuthors.splice(index, 1);
  }
  
  // 更新作者标签UI
  const authorTags = document.querySelectorAll('[data-author]');
  authorTags.forEach(tag => {
    if (tag.dataset.author === author) {
      // 先移除上一次可能的高亮动画
      tag.classList.remove('tag-highlight');
      
      // 添加/移除激活状态
      tag.classList.toggle('active', activeAuthors.includes(author));
      
      // 添加高亮动画
      setTimeout(() => {
        tag.classList.add('tag-highlight');
      }, 10);
      
      // 移除高亮动画
      setTimeout(() => {
        tag.classList.remove('tag-highlight');
      }, 1000);
    }
  });
  
  // 重新渲染论文列表
  renderPapers();
}

// 从URL参数中获取category
function getUrlCategory() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category');
  return category ? decodeURIComponent(category) : null;
}

// 从URL参数中获取json（API模式）
function getJsonParam() {
  const params = new URLSearchParams(window.location.search);
  const json = params.get('json');
  return json ? decodeURIComponent(json) : null;
}

// 从URL参数中获取author
function getUrlAuthor() {
  const params = new URLSearchParams(window.location.search);
  const author = params.get('author');
  return author ? decodeURIComponent(author).split(',').map(k => k.trim()).filter(k => k) : null;
}

// 从URL参数中获取keywords
function getUrlKeywords() {
  const params = new URLSearchParams(window.location.search);
  const keywords = params.get('keywords');
  return keywords ? decodeURIComponent(keywords).split(',').map(k => k.trim()).filter(k => k) : null;
}

// 检查是否以JSON模式运行
function isJsonMode() {
  return getUrlCategory() !== null || getJsonParam() !== null || getUrlAuthor() !== null || getUrlKeywords() !== null;
}

// 输出JSON格式的论文数据
function outputJsonData(papers, category) {
  const jsonData = {
    category: category,
    author: urlAuthorParam || null,
    keywords: urlKeywordsParam || null,
    count: papers.length,
    papers: papers.map(p => ({
      id: p.id,
      title: p.title,
      authors: p.authors,
      categories: p.category,
      summary: p.summary,
      date: p.date,
      url: p.url,
      reason: p.matchReason
    }))
  };

  // 清空页面内容
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  // 设置JSON内容
  document.body.textContent = JSON.stringify(jsonData, null, 2);
}

// 根据category获取论文（复用现有逻辑）
function getPapersByCategory(paperData, category) {
  let papers = [];
  if (category === 'all') {
    const { sortedCategories } = getAllCategories(paperData);
    sortedCategories.forEach(cat => {
      if (paperData[cat]) {
        papers = papers.concat(paperData[cat]);
      }
    });
  } else if (paperData[category]) {
    papers = paperData[category];
  }
  return papers;
}

// 根据keywords匹配论文（复用现有逻辑：关键词之间是"或"关系）
function matchPapersByKeywords(papers, keywords) {
  if (!keywords || keywords.length === 0) return papers.map(p => ({ ...p, isMatched: false, matchReason: null }));

  return papers.map(paper => {
    const matches = keywords.some(keyword => {
      const searchText = `${paper.title} ${paper.summary}`.toLowerCase();
      return searchText.includes(keyword.toLowerCase());
    });

    if (matches) {
      const matchedKeywords = keywords.filter(keyword => {
        const searchText = `${paper.title} ${paper.summary}`.toLowerCase();
        return searchText.includes(keyword.toLowerCase());
      });
      return {
        ...paper,
        isMatched: true,
        matchReason: matchedKeywords.length > 0 ? `关键词: ${matchedKeywords.join(', ')}` : null
      };
    }
    return { ...paper, isMatched: false, matchReason: null };
  });
}

// 根据author匹配论文（复用现有逻辑）
function matchPapersByAuthor(papers, query_authors) {
  if (!query_authors) return papers.map(p => ({ ...p, isMatched: false, matchReason: null }));

  return papers.map(paper => {
    const matches = query_authors.some(author => {
      const searchText = `${paper.authors}`.toLowerCase();
      return searchText.includes(author.toLowerCase());
    });

    if (matches) {
      const matchedAuthors = query_authors.filter(author => {
        const searchText = `${paper.authors}`.toLowerCase();
        return searchText.includes(author.toLowerCase());
      });
      return {
        ...paper,
        isMatched: true,
        matchReason: matchedAuthors.length > 0 ? `作者: ${matchedAuthors.join(', ')}` : null
      };
    }
    return { ...paper, isMatched: false, matchReason: null };
  });
}

// 组合keywords和author匹配（复用现有逻辑：关键词和作者是"或"关系）
function matchPapersByKeywordsOrAuthor(papers, keywords, author) {
  // 先获取关键词匹配结果
  const keywordResults = matchPapersByKeywords(papers, keywords);

  // 再获取作者匹配结果
  const authorResults = matchPapersByAuthor(papers, author);

  // 合并：关键词或作者匹配都算
  return papers.map((paper, index) => {
    const keywordMatch = keywordResults[index];
    const authorMatch = authorResults[index];

    const isMatched = keywordMatch.isMatched || authorMatch.isMatched;
    const matchReasons = [];
    if (keywordMatch.isMatched && keywordMatch.matchReason) {
      matchReasons.push(keywordMatch.matchReason);
    }
    if (authorMatch.isMatched && authorMatch.matchReason) {
      matchReasons.push(authorMatch.matchReason);
    }

    return {
      ...paper,
      isMatched: isMatched,
      matchReason: matchReasons.length > 0 ? matchReasons.join(' | ') : null
    };
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initRecommendationControls();
  renderArchiveFreshness();
  if (readingStore.error) showReadingFeedback(readingStore.error);

  // 加载用户关键词
  loadUserKeywords();

  // 加载用户作者
  loadUserAuthors();

  // 解析URL中的category、json、author和keywords参数
  urlCategoryParam = getUrlCategory();
  urlJsonParam = getJsonParam();
  urlAuthorParam = getUrlAuthor();
  urlKeywordsParam = getUrlKeywords();

  loadArchive();
});

function initEventListeners() {
  // 日期选择器相关的事件监听
  const calendarButton = document.getElementById('calendarButton');
  calendarButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDatePicker();
  });
  
  const datePickerModal = document.querySelector('.date-picker-modal');
  datePickerModal.addEventListener('click', (event) => {
    if (event.target === datePickerModal) {
      toggleDatePicker();
    }
  });
  
  const datePickerContent = document.querySelector('.date-picker-content');
  datePickerContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.getElementById('dateRangeMode').addEventListener('change', toggleRangeMode);
  
  // 其他原有的事件监听器
  document.getElementById('closeModal').addEventListener('click', closeModal);
  
  document.querySelector('.paper-modal').addEventListener('click', (event) => {
    const modal = document.querySelector('.paper-modal');
    const pdfContainer = modal.querySelector('.pdf-container');
    
    // 如果点击的是模态框背景
    if (event.target === modal) {
      // 检查PDF是否处于放大状态
      if (pdfContainer && pdfContainer.classList.contains('expanded')) {
        // 如果PDF是放大的，先将其恢复正常大小
        const expandButton = modal.querySelector('.pdf-expand-btn');
        if (expandButton) {
          togglePdfSize(expandButton);
        }
        // 阻止事件继续传播，防止关闭整个模态框
        event.stopPropagation();
      } else {
        // 如果PDF不是放大状态，则关闭整个模态框
        closeModal();
      }
    }
  });
  
  // 添加键盘事件监听 - Esc 键关闭模态框，左右箭头键切换论文，R 键显示随机论文
  document.addEventListener('keydown', (event) => {
    // 检查是否有输入框或文本区域处于焦点状态
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' || 
      activeElement.isContentEditable
    );
    
    if (event.key === 'Escape') {
      const paperModal = document.getElementById('paperModal');
      const datePickerModal = document.getElementById('datePickerModal');
      
      // 关闭论文模态框
      if (paperModal.classList.contains('active')) {
        closeModal();
      }
      // 关闭日期选择器模态框
      else if (datePickerModal.classList.contains('active')) {
        toggleDatePicker();
      }
    }
    // 左右箭头键导航论文（仅在论文模态框打开时）
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const paperModal = document.getElementById('paperModal');
      if (paperModal.classList.contains('active')) {
        event.preventDefault(); // 防止页面滚动
        
        if (event.key === 'ArrowLeft') {
          navigateToPreviousPaper();
        } else if (event.key === 'ArrowRight') {
          navigateToNextPaper();
        }
      }
    }
    // space 键显示随机论文（在没有输入框焦点且日期选择器未打开时）
    else if (event.key === ' ' || event.key === 'Spacebar') {
      const paperModal = document.getElementById('paperModal');
      const datePickerModal = document.getElementById('datePickerModal');
      
      // 只有在没有输入框焦点且日期选择器没有打开时才触发
      // 现在允许在论文模态框打开时也能使用R键切换到随机论文
      if (!isInputFocused && !datePickerModal.classList.contains('active')) {
        event.preventDefault(); // 防止页面刷新
        event.stopPropagation(); // 阻止事件冒泡
        showRandomPaper();
      }
    }
  });
  
  // 添加鼠标滚轮横向滚动支持
  const categoryScroll = document.querySelector('.category-scroll');
  const keywordScroll = document.querySelector('.keyword-scroll');
  const authorScroll = document.querySelector('.author-scroll');
  
  // 为类别滚动添加鼠标滚轮事件
  if (categoryScroll) {
    categoryScroll.addEventListener('wheel', function(e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        this.scrollLeft += e.deltaY;
      }
    });
  }
  
  // 为关键词滚动添加鼠标滚轮事件
  if (keywordScroll) {
    keywordScroll.addEventListener('wheel', function(e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        this.scrollLeft += e.deltaY;
      }
    });
  }
  
  // 为作者滚动添加鼠标滚轮事件
  if (authorScroll) {
    authorScroll.addEventListener('wheel', function(e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        this.scrollLeft += e.deltaY;
      }
    });
  }

  // 其他事件监听器...
  const categoryButtons = document.querySelectorAll('.category-button');
  categoryButtons.forEach(button => {
    button.addEventListener('click', () => {
      const category = button.dataset.category;
      filterByCategory(category);
    });
  });

  // 回到顶部按钮：滚动显示/隐藏 + 点击回到顶部
  const backToTopButton = document.getElementById('backToTop');
  if (backToTopButton) {
    const updateBackToTopVisibility = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (scrollTop > 300) {
        backToTopButton.classList.add('visible');
      } else {
        backToTopButton.classList.remove('visible');
      }
    };

    // 初始判断一次（防止刷新在中部时不显示）
    updateBackToTopVisibility();
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });

    backToTopButton.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  document.getElementById('readingView').addEventListener('change', event => {
    readingView = event.target.value;
    renderPapers();
  });
  document.getElementById('exportReadRecords').addEventListener('click', () => {
    const blob = new Blob([readingStore.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'daily-arxiv-read-records.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.addEventListener('storage', event => {
    if (event.key === readingStore.key || event.key === null) {
      readingStore.reload();
      if (readingStore.error) showReadingFeedback(readingStore.error);
      renderPapers();
    }
  });

  document.getElementById('onlySearchMatches').addEventListener('change', event => {
    onlySearchMatches = event.target.checked;
    renderPapers();
  });
  document.getElementById('clearSearchResults').addEventListener('click', () => {
    document.getElementById('textSearchClear').click();
  });

  // 文本搜索：放大镜切换显示输入框
  const searchToggle = document.getElementById('textSearchToggle');
  const searchWrapper = document.querySelector('#textSearchContainer .search-input-wrapper');
  const searchInput = document.getElementById('textSearchInput');
  const searchClear = document.getElementById('textSearchClear');

  if (searchToggle && searchWrapper && searchInput && searchClear) {
    searchToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      searchWrapper.style.display = 'flex';
      searchToggle.setAttribute('aria-expanded', 'true');
      searchInput.focus();
    });

    const handleInput = () => {
      textSearchQuery = searchInput.value.trim();
      if (!textSearchQuery) onlySearchMatches = false;
      searchClear.style.display = textSearchQuery ? 'inline-flex' : 'none';
      renderPapers();
    };

    searchInput.addEventListener('input', handleInput);
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        searchWrapper.style.display = 'none';
        searchToggle.setAttribute('aria-expanded', 'false');
        searchToggle.focus();
      }
    });

    // 清除按钮：清空文本，恢复其他过滤
    searchClear.addEventListener('click', (e) => {
      e.stopPropagation();
      searchInput.value = '';
      handleInput();
      // 清空后隐藏输入框
      searchWrapper.style.display = 'none';
      searchToggle.setAttribute('aria-expanded', 'false');
      searchToggle.focus();
    });

    // 失焦时：若文本为空则隐藏输入框（保持有文本时不隐藏）
    searchInput.addEventListener('blur', () => {
      const value = searchInput.value.trim();
      if (value.length === 0) {
        searchWrapper.style.display = 'none';
        searchToggle.setAttribute('aria-expanded', 'false');
      }
    });

    // 点击其他地方不隐藏输入框（需求4），因此不添加blur隐藏逻辑
  }
}

// Function to detect preferred language based on browser settings
function getPreferredLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  // Check if browser is set to Chinese variants
  if (browserLang.startsWith('zh')) {
    return 'Chinese';
  }
  // Default to Chinese for all other languages
  return 'Chinese';
}

// Function to select the best available language for a date
function selectLanguageForDate(date, preferredLanguage = null) {
  const availableLanguages = window.dateLanguageMap?.get(date) || [];
  
  if (availableLanguages.length === 0) {
    return 'Chinese'; // fallback
  }
  
  // Use provided preference or detect from browser
  const preferred = preferredLanguage || getPreferredLanguage();
  
  // If preferred language is available, use it
  if (availableLanguages.includes(preferred)) {
    return preferred;
  }
  
  // Fallback: prefer Chinese if available, otherwise use the first available
  return availableLanguages.includes('Chinese') ? 'Chinese' : availableLanguages[0];
}

async function fetchAvailableDates() {
  try {
    // 从 data 分支获取文件列表
    const fileListUrl = DATA_CONFIG.getDataUrl('assets/file-list.txt');
    const response = await fetchWithTimeout(fileListUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const files = text.trim().split('\n');

    const dateRegex = /(\d{4}-\d{2}-\d{2})_AI_enhanced_(English|Chinese)\.jsonl/;
    const dateLanguageMap = new Map(); // Store date -> available languages
    const dates = [];
    
    files.forEach(file => {
      const match = file.match(dateRegex);
      if (match && match[1] && match[2]) {
        const date = match[1];
        const language = match[2];
        
        if (!dateLanguageMap.has(date)) {
          dateLanguageMap.set(date, []);
          dates.push(date);
        }
        dateLanguageMap.get(date).push(language);
      }
    });
    
    // Store the language mapping globally for later use
    window.dateLanguageMap = dateLanguageMap;
    availableDates = [...new Set(dates)];
    availableDates.sort((a, b) => new Date(b) - new Date(a));

    initDatePicker(); // Assuming this function uses availableDates

    return availableDates;
  } catch (error) {
    console.error('获取可用日期失败:', error);
    throw error;
  }
}

function initDatePicker() {
  const datepickerInput = document.getElementById('datepicker');
  
  if (flatpickrInstance) {
    flatpickrInstance.destroy();
  }
  
  // 创建可用日期的映射，用于禁用无效日期
  const enabledDatesMap = {};
  availableDates.forEach(date => {
    enabledDatesMap[date] = true;
  });
  
  if (typeof flatpickr !== 'function') {
    datepickerInput.type = 'date';
    datepickerInput.value = availableDates[0] || '';
    datepickerInput.onchange = () => { if (availableDates.includes(datepickerInput.value)) { loadPapersByDate(datepickerInput.value); toggleDatePicker(); } };
    document.getElementById('dateRangeMode').disabled = true;
    return;
  }

  // 配置 Flatpickr
  flatpickrInstance = flatpickr(datepickerInput, {
    inline: true,
    dateFormat: "Y-m-d",
    defaultDate: availableDates[0],
    enable: [
      function(date) {
        // 只启用有效日期
        const dateStr = date.getFullYear() + "-" +
                        String(date.getMonth() + 1).padStart(2, '0') + "-" +
                        String(date.getDate()).padStart(2, '0');
        return Boolean(enabledDatesMap[dateStr]);
      }
    ],
    onChange: function(selectedDates, dateStr) {
      if (isRangeMode && selectedDates.length === 2) {
        // 处理日期范围选择
        const startDate = formatDateForAPI(selectedDates[0]);
        const endDate = formatDateForAPI(selectedDates[1]);
        loadPapersByDateRange(startDate, endDate);
        toggleDatePicker();
      } else if (!isRangeMode && selectedDates.length === 1) {
        // 处理单个日期选择
        const selectedDate = formatDateForAPI(selectedDates[0]);
        if (availableDates.includes(selectedDate)) {
          loadPapersByDate(selectedDate);
          toggleDatePicker();
        }
      }
    }
  });
  
  // 隐藏日期输入框
  const inputElement = document.querySelector('.flatpickr-input');
  if (inputElement) {
    inputElement.style.display = 'none';
  }
}

function formatDateForAPI(date) {
  return date.getFullYear() + "-" + 
         String(date.getMonth() + 1).padStart(2, '0') + "-" + 
         String(date.getDate()).padStart(2, '0');
}

function toggleRangeMode() {
  isRangeMode = document.getElementById('dateRangeMode').checked;
  
  if (flatpickrInstance) {
    flatpickrInstance.set('mode', isRangeMode ? 'range' : 'single');
    if (selectedDateBounds.length) flatpickrInstance.setDate(isRangeMode ? selectedDateBounds : selectedDateBounds[selectedDateBounds.length - 1], false);
  }
}

// Keep all reads bounded, including downloading the response body.
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = response.ok ? await response.text() : '';
    return { ok: response.ok, status: response.status, text: async () => text };
  } finally {
    clearTimeout(timeout);
  }
}

function showLoadNotice(message, retry) {
  const notice = document.getElementById('loadNotice');
  notice.replaceChildren();
  notice.hidden = !message;
  if (!message) return;
  const text = document.createElement('span');
  text.textContent = message;
  notice.appendChild(text);
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recovery-button';
    button.textContent = '重试读取';
    button.addEventListener('click', retry);
    notice.appendChild(button);
  }
}

async function loadArchive() {
  const container = document.getElementById('paperContainer');
  showLoadNotice('');
  document.getElementById('currentDate').textContent = '正在读取归档…';
  container.innerHTML = '<div class="loading-container"><p>正在读取可用日期…</p></div>';
  try {
    await fetchAvailableDates();
    if (availableDates.length) return loadPapersByDate(availableDates[0]);
    document.getElementById('currentDate').textContent = '暂无归档';
    container.innerHTML = '<div class="loading-container"><p>暂无论文归档。完成 Zotero 和 DeepSeek 配置后，运行每日更新任务。</p><a href="setup.html">查看配置说明</a></div>';
    document.getElementById('recommendationStatus').textContent = '首次更新完成后，即可切换两种推荐方式。';
  } catch (error) {
    document.getElementById('currentDate').textContent = '归档读取失败';
    document.getElementById('recommendationStatus').textContent = '暂时无法读取可用日期。';
    container.replaceChildren();
    showLoadNotice('归档列表读取失败，请检查网络后重试。', loadArchive);
  }
}

async function loadPapersByDate(date) {
  if (flatpickrInstance) flatpickrInstance.setDate(date, false);
  return loadPaperDates([date], formatDate(date));
}

async function loadPaperDates(dates, label, previousResults = []) {
  selectedDateBounds = [dates[0], dates[dates.length - 1]].sort();
  const version = ++paperLoadVersion;
  papersLoading = true;
  currentDate = dates.length === 1 ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`;
  document.getElementById('currentDate').textContent = label;
  const container = document.getElementById('paperContainer');
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>正在读取论文…</p></div>';
  document.getElementById('recommendationStatus').textContent = `正在读取 ${dates.length} 天的论文…`;
  currentFilteredPapers = [];
  showLoadNotice('');
  const results = new Array(dates.length);
  let next = 0;
  let completed = 0;
  async function worker() {
    while (next < dates.length) {
      const index = next++;
      const date = dates[index];
      if (previousResults[index]?.data) {
        results[index] = previousResults[index];
        completed++;
        continue;
      }
      try {
        const language = selectLanguageForDate(date);
        const response = await fetchWithTimeout(DATA_CONFIG.getDataUrl(`data/${date}_AI_enhanced_${language}.jsonl`));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        results[index] = { data: parseJsonlData(await response.text(), date) };
      } catch (error) {
        results[index] = { error, date };
      }
      completed++;
      if (version !== paperLoadVersion) return;
      document.getElementById('recommendationStatus').textContent = `正在读取论文：${completed} / ${dates.length} 天`;
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, dates.length) }, worker));
  if (version !== paperLoadVersion) return;
  papersLoading = false;
  container.setAttribute('aria-busy', 'false');
  paperData = {};
  const seen = new Set();
  const failed = [];
  for (const result of results) {
    if (result.error) { failed.push(result.date); continue; }
    for (const [category, papers] of Object.entries(result.data)) {
      for (const paper of papers) {
        if (seen.has(paper.id)) continue;
        seen.add(paper.id);
        (paperData[category] ||= []).push(paper);
      }
    }
  }
  renderCategoryFilter(getAllCategories(paperData));
  if (urlCategoryParam !== null || urlJsonParam !== null || urlAuthorParam !== null || urlKeywordsParam !== null) {
    const target = urlCategoryParam || urlJsonParam || 'all';
    let papers = getPapersByCategory(paperData, target);
    if (urlKeywordsParam || urlAuthorParam) papers = matchPapersByKeywordsOrAuthor(papers, urlKeywordsParam, urlAuthorParam);
    outputJsonData(papers.filter(paper => paper.isMatched), target);
    return;
  }
  renderPapers();
  if (failed.length) {
    if (failed.length === dates.length) container.replaceChildren();
    showLoadNotice(`${failed.length === dates.length ? '论文读取失败' : '已显示读取成功的论文'}；以下日期读取失败：${failed.join('、')}。`, () => loadPaperDates(dates, label, results));
  }
}

function parseJsonlData(jsonlText, date) {
  const result = {};
  
  const lines = jsonlText.trim().split('\n');
  
  lines.forEach(line => {
    try {
      const paper = JSON.parse(line);
      
      if (!Array.isArray(paper.categories) || !paper.categories.length || !paper.title) {
        return;
      }
      
      let allCategories = Array.isArray(paper.categories) ? paper.categories : [paper.categories];
      
      const primaryCategory = allCategories[0];
      
      if (!result[primaryCategory]) {
        result[primaryCategory] = [];
      }
      
      const summary = paper.AI && paper.AI.tldr ? paper.AI.tldr : escapeHtml(paper.summary);
      
      result[primaryCategory].push({
        title: paper.title,
        url: `https://arxiv.org/abs/${encodeURIComponent(String(paper.id)).replace(/%2F/g, '/')}`,
        authors: Array.isArray(paper.authors) ? paper.authors.join(', ') : String(paper.authors || ''),
        category: allCategories,
        summary: summary,
        details: paper.summary || '',
        date: date,
        id: paper.id,
        motivation: paper.AI && paper.AI.motivation ? paper.AI.motivation : '',
        method: paper.AI && paper.AI.method ? paper.AI.method : '',
        result: paper.AI && paper.AI.result ? paper.AI.result : '',
        conclusion: paper.AI && paper.AI.conclusion ? paper.AI.conclusion : '',
        code_url: /^https?:\/\//i.test(paper.code_url || '') ? paper.code_url : '',
        code_stars: paper.code_stars || 0,
        code_last_update: paper.code_last_update || '',
        zotero: paper.zotero || null,
        hasAI: Boolean(paper.AI && paper.AI.tldr),
        summaryStatus: paper.summary_status || (paper.AI ? 'cached' : 'not_selected')
      });
    } catch (error) {
      console.error('解析JSON行失败:', error, line);
    }
  });
  
  return result;
}

// 获取所有类别并按偏好排序
function getAllCategories(data) {
  const categories = Object.keys(data);
  const catePaperCount = {};
  
  categories.forEach(category => {
    catePaperCount[category] = data[category] ? data[category].length : 0;
  });
  
  return {
    sortedCategories: categories.sort((a, b) => {
      return a.localeCompare(b);
    }),
    categoryCounts: catePaperCount
  };
}

function renderCategoryFilter(categories) {
  const container = document.querySelector('.category-scroll');
  const { sortedCategories, categoryCounts } = categories;
  if (currentCategory !== 'all' && !sortedCategories.includes(currentCategory)) currentCategory = 'all';
  
  let totalPapers = 0;
  Object.values(categoryCounts).forEach(count => {
    totalPapers += count;
  });
  
  container.innerHTML = `
    <button class="category-button ${currentCategory === 'all' ? 'active' : ''}" data-category="all">全部<span class="category-count">${totalPapers}</span></button>
  `;
  
  sortedCategories.forEach(category => {
    const count = categoryCounts[category];
    const button = document.createElement('button');
    button.className = `category-button ${category === currentCategory ? 'active' : ''}`;
    button.innerHTML = `${escapeHtml(category)}<span class="category-count">${count}</span>`;
    button.dataset.category = category;
    button.addEventListener('click', () => {
      filterByCategory(category);
    });
    
    container.appendChild(button);
  });
  
  document.querySelector('.category-button[data-category="all"]').addEventListener('click', () => {
    filterByCategory('all');
  });
}

function filterByCategory(category) {
  currentCategory = category;

  // 如果不是JSON模式，才更新URL参数
  if (!isJsonMode()) {
    const url = new URL(window.location);
    if (category === 'all') {
      url.searchParams.delete('viewCategory');
    } else {
      url.searchParams.set('viewCategory', category);
    }
    // 使用replaceState更新URL，不刷新页面
    window.history.replaceState({}, '', url);
  }

  document.querySelectorAll('.category-button').forEach(button => {
    button.classList.toggle('active', button.dataset.category === category);
  });

  // 保持当前激活的过滤标签
  renderFilterTags();

  // 重置页面滚动条到顶部
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
  
  renderPapers();
}

// 帮助函数：高亮文本中的匹配内容
function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

function highlightMatches(text, terms, className = 'keyword-highlight') {
  const value = String(text || '');
  const escapedTerms = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escapedTerms.length) return escapeHtml(value);
  const expression = new RegExp(escapedTerms.join('|'), 'gi');
  let output = '', position = 0;
  for (const match of value.matchAll(expression)) {
    output += escapeHtml(value.slice(position, match.index)) + `<span class="${className}">${escapeHtml(match[0])}</span>`;
    position = match.index + match[0].length;
  }
  return output + escapeHtml(value.slice(position));
}

function paperAnnotations(paper) {
  const messages = { failed: '本次概括生成失败，显示原始摘要', daily_limit: '今日生成额度已用完，显示原始摘要', not_selected: '未进入本次中文概括范围，显示原始摘要' };
  const score = Recommendations.hasScore(paper)
    ? `<span class="zotero-score" title="摘要相似度按 Zotero 入库先后加权，分数不是概率">Zotero 相关性 ${paper.zotero.score.toFixed(2)}</span>` : '';
  const source = paper.hasAI ? (DATA_CONFIG.demo ? '演示中文概括' : 'DeepSeek 中文概括') : '原始摘要';
  return `<div class="paper-annotations">${score}<span class="summary-source" data-ai="${paper.hasAI}" title="${paper.hasAI ? '根据论文摘要生成，请核对原文' : (messages[paper.summaryStatus] || messages.not_selected)}">${source}</span></div>`;
}

function initRecommendationControls() {
  document.getElementById('demoNotice').hidden = !DATA_CONFIG.demo;
  document.getElementById('categoryFilters').hidden = recommendationMode === 'zotero';
  document.querySelectorAll('[data-recommendation]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.recommendation === recommendationMode));
    button.addEventListener('click', () => {
      recommendationMode = button.dataset.recommendation;
      localStorage.setItem('recommendationMode', recommendationMode);
      document.getElementById('categoryFilters').hidden = recommendationMode === 'zotero';
      document.querySelectorAll('[data-recommendation]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      renderPapers();
    });
  });
}

function formatBeijingUpdate(timestamp) {
  // An offset is required: a local/ambiguous date must not become a claimed update time.
  if (typeof timestamp !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(timestamp)) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

function renderArchiveFreshness() {
  const element = document.getElementById('archiveFreshness');
  const time = formatBeijingUpdate(DATA_CONFIG.archiveUpdatedAt);
  element.textContent = DATA_CONFIG.demo
    ? '演示数据 · 非真实更新记录'
    : !DATA_CONFIG.latestArchive
      ? '暂无归档更新记录'
      : time
        ? `最近更新：${time}（北京时间） · 最新归档批次：${DATA_CONFIG.latestArchive}（UTC）`
        : `最近更新：历史归档未记录完成时间 · 最新归档批次：${DATA_CONFIG.latestArchive}（UTC）`;
  element.title = '最近更新是最新归档数据处理完成的时间，页面重新发布不会刷新它。归档批次按 UTC 日期命名，并非论文发表日期。';
}

function updateRecommendationStatus(papers, displayed) {
  const visible = displayed || (textSearchQuery.trim() && onlySearchMatches ? papers.filter(paper => paper.isMatched) : papers);
  const count = visible.filter(paper => paper.hasAI).length;
  const scored = papers.filter(Recommendations.hasScore).length;
  let description = recommendationMode === 'zotero'
    ? (scored ? '按与你 Zotero 文献库的相关性排序' : '这批归档还没有 Zotero 分数，暂按原顺序显示')
    : '按类别浏览，关键词、作者命中的论文置前';
  if (textSearchQuery.trim()) description = `搜索“${textSearchQuery}”：匹配 ${papers.filter(paper => paper.isMatched).length} / ${papers.length} 篇 · ${onlySearchMatches ? '仅显示匹配论文' : '匹配论文置前，保留其余论文'}；清空搜索后恢复推荐顺序`;
  const failures = visible.filter(paper => paper.summaryStatus === 'failed').length;
  document.getElementById('recommendationStatus').textContent = `${description} · 当前显示 ${visible.length} 篇，其中 ${count} 篇有中文概括${failures ? `，${failures} 篇概括生成失败，已保留原摘要` : ''}`;
}

// 帮助函数：格式化作者列表（用于论文卡片显示）
// 规则：≤4个作者全部显示，>4个作者显示前2+后2，中间用省略号
function formatAuthorsForCard(authorsString, authorTerms = []) {
  if (!authorsString) {
    return '';
  }
  
  // 将作者字符串解析为数组（处理逗号分隔的情况）
  const authorsArray = authorsString.split(',').map(author => author.trim()).filter(author => author.length > 0);
  
  if (authorsArray.length === 0) {
    return '';
  }
  
  // 如果不超过4个作者，全部显示
  if (authorsArray.length <= 4) {
    return authorsArray.map(author => {
      // 对每个作者应用高亮
      const highlightedAuthor = authorTerms.length > 0 
        ? highlightMatches(author, authorTerms, 'author-highlight')
        : escapeHtml(author);
      return `<span class="author-item">${highlightedAuthor}</span>`;
    }).join(', ');
  }
  
  // 超过4个作者：显示前2个、省略号、后2个
  const firstTwo = authorsArray.slice(0, 2);
  const lastTwo = authorsArray.slice(-2);
  
  const result = [];
  
  // 前2个作者
  firstTwo.forEach(author => {
    const highlightedAuthor = authorTerms.length > 0 
      ? highlightMatches(author, authorTerms, 'author-highlight')
      : escapeHtml(author);
    result.push(`<span class="author-item">${highlightedAuthor}</span>`);
  });
  
  // 省略号
  result.push('<span class="author-ellipsis">...</span>');
  
  // 后2个作者
  lastTwo.forEach(author => {
    const highlightedAuthor = authorTerms.length > 0 
      ? highlightMatches(author, authorTerms, 'author-highlight')
      : escapeHtml(author);
    result.push(`<span class="author-item">${highlightedAuthor}</span>`);
  });
  
  return result.join(', ');
}

function showReadingFeedback(message, undo) {
  const feedback = document.getElementById('readingFeedback');
  feedback.replaceChildren();
  feedback.hidden = !message;
  const text = document.createElement('span');
  text.textContent = message;
  feedback.appendChild(text);
  if (undo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recovery-button';
    button.textContent = '撤销';
    button.addEventListener('click', undo);
    feedback.appendChild(button);
  }
}

function changeReadState(paper, read, index) {
  if (!readingStore.update(paper, read)) {
    showReadingFeedback(readingStore.error);
    return;
  }
  renderPapers();
  showReadingFeedback(read ? '已标记已读，不再进入未读前 50。' : '已恢复为未读。', () => {
    if (readingStore.update(paper, !read)) {
      renderPapers();
      showReadingFeedback('已撤销。');
      document.getElementById('readingView').focus();
    } else showReadingFeedback(readingStore.error);
  });
  const buttons = document.querySelectorAll('#paperContainer .mark-read');
  if (buttons.length) buttons[Math.min(index, buttons.length - 1)].focus();
  else document.getElementById('readingView').focus();
}

function renderPapers() {
  if (papersLoading) return;
  const container = document.getElementById('paperContainer');
  container.innerHTML = '';
  container.className = `paper-container ${currentView === 'list' ? 'list-view' : ''}`;
  
  const { sortedCategories } = getAllCategories(paperData);
  const papers = readingView === 'read' ? readingStore.list() : sortedCategories.flatMap(category => paperData[category] || []);
  const selectedPapers = Recommendations.select(papers, {
    mode: recommendationMode, category: readingView === 'read' ? 'all' : currentCategory,
    keywords: activeKeywords, authors: activeAuthors, query: textSearchQuery
  });
  const searching = Boolean(textSearchQuery.trim());
  const searchPapers = searching && onlySearchMatches ? selectedPapers.filter(paper => paper.isMatched) : selectedPapers;
  const filteredPapers = readingView === 'read' ? searchPapers : readingStore.select(searchPapers, readingView);
  document.getElementById('readingCount').textContent = readingView === 'read'
    ? `已读 ${readingStore.list().length} 篇（跨日期记录）`
    : `当前范围 ${selectedPapers.length} 篇 · 显示 ${filteredPapers.length} 篇${readingView === 'unread' ? '未读' : ''}`;
  updateRecommendationStatus(selectedPapers, filteredPapers);
  document.getElementById('searchResultsControls').hidden = !searching;
  document.getElementById('onlySearchMatches').checked = onlySearchMatches;

  // 存储当前过滤后的论文列表，用于箭头键导航
  currentFilteredPapers = [...filteredPapers];
  
  if (filteredPapers.length === 0) {
    container.innerHTML = `
      <div class="loading-container">
        <p>${searching && onlySearchMatches ? '没有匹配的论文，请换个搜索词或清空搜索。' : readingView === 'read' ? '还没有已读记录。点击论文上的“标记已读”后，可在这里查看和恢复。' : readingView === 'unread' && selectedPapers.length ? '当前范围的论文已全部读过。可选择其他日期，或切换“全部论文”。' : '当前日期与分类暂无论文，可选择其他日期或切换全部分类。'}</p>
      </div>
    `;
    return;
  }
  
  filteredPapers.forEach((paper, index) => {
    const paperCard = document.createElement('article');
    // 添加匹配高亮类
    paperCard.className = `paper-card ${paper.isMatched ? 'matched-paper' : ''}`;
    paperCard.dataset.id = paper.id || paper.url;
    
    if (paper.isMatched) {
      // 添加匹配原因提示
      paperCard.title = `匹配: ${paper.matchReason.join(' | ')}`;
    }
    
    const categoryTags = paper.category.map(cat => `<span class="category-tag">${escapeHtml(cat)}</span>`).join('');
    
    // 组合需要高亮的词：关键词 + 文本搜索
    const titleSummaryTerms = [];
    if (activeKeywords.length > 0) {
      titleSummaryTerms.push(...activeKeywords);
    }
    if (textSearchQuery && textSearchQuery.trim().length > 0) {
      titleSummaryTerms.push(textSearchQuery.trim());
    }

    // 高亮标题和摘要（关键词与文本搜索）
    const highlightedTitle = titleSummaryTerms.length > 0 
      ? highlightMatches(paper.title, titleSummaryTerms, 'keyword-highlight') 
      : escapeHtml(paper.title);
    const highlightedSummary = titleSummaryTerms.length > 0 
      ? highlightMatches(paper.summary, titleSummaryTerms, 'keyword-highlight') 
      : escapeHtml(paper.summary);

    // 高亮作者（作者过滤 + 文本搜索）
    const authorTerms = [];
    if (activeAuthors.length > 0) authorTerms.push(...activeAuthors);
    if (textSearchQuery && textSearchQuery.trim().length > 0) authorTerms.push(textSearchQuery.trim());
    
    // 格式化作者列表（应用截断规则和高亮）
    const formattedAuthors = formatAuthorsForCard(paper.authors, authorTerms);
    
    // 构建 GitHub 按钮 HTML
    // let githubHtml = '';
    // if (paper.code_url) {
    //   const stars = paper.code_stars ? `<span class="github-stars">★ ${paper.code_stars}</span>` : '';
    //   const isHot = paper.code_stars > 100;
      
    //   githubHtml = `
    //     <a href="${paper.code_url}" target="_blank" class="github-link" title="View Code" onclick="event.stopPropagation()">
    //       <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;">
    //         <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
    //       </svg>
    //       Code ${stars}
    //       ${isHot ? '<span class="hot-icon">🔥</span>' : ''}
    //     </a>
    //   `;
    // }

    paperCard.innerHTML = `
      <div class="paper-card-index">${index + 1}</div>
      ${paper.isMatched ? '<div class="match-badge" title="匹配您的搜索条件"></div>' : ''}
      <div class="paper-card-header">
        <h3 class="paper-card-title">${highlightedTitle}</h3>
        <p class="paper-card-authors">${formattedAuthors}</p>
        <div class="paper-card-categories">
          ${categoryTags}
        </div>
        ${paperAnnotations(paper)}
      </div>
      <div class="paper-card-body">
        <p class="paper-card-summary">${highlightedSummary}</p>
        <div class="paper-card-footer">
          <div class="footer-left">
            <span class="paper-card-date">${formatDate(paper.date)}</span>
          </div>

        </div>
      </div>
    `;
    
    const actions = document.createElement('div');
    actions.className = 'paper-reading-actions';
    const detailButton = document.createElement('button');
    detailButton.type = 'button';
    detailButton.className = 'paper-details-button';
    detailButton.textContent = '查看详情';
    detailButton.setAttribute('aria-label', '查看论文：' + paper.title);
    actions.appendChild(detailButton);
    const readButton = document.createElement('button');
    readButton.type = 'button';
    readButton.className = 'recovery-button mark-read';
    const alreadyRead = readingStore.has(paper);
    readButton.textContent = alreadyRead ? '恢复未读' : '标记已读';
    readButton.setAttribute('aria-label', readButton.textContent + '：' + paper.title);
    readButton.addEventListener('click', event => {
      event.stopPropagation();
      changeReadState(paper, !alreadyRead, index);
    });
    actions.appendChild(readButton);
    paperCard.appendChild(actions);

    paperCard.addEventListener('click', () => {
      currentPaperIndex = index; // 记录当前点击的论文索引
      showPaperDetails(paper, index + 1);
    });
    
    container.appendChild(paperCard);
  });
}

function showPaperDetails(paper, paperIndex) {
  const modal = document.getElementById('paperModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const paperLink = document.getElementById('paperLink');
  const pdfLink = document.getElementById('pdfLink');
  const htmlLink = document.getElementById('htmlLink');
  
  // 重置模态框的滚动位置
  modalBody.scrollTop = 0;
  
  // 组合高亮词：关键词 + 文本搜索
  const modalTitleTerms = [];
  if (activeKeywords.length > 0) modalTitleTerms.push(...activeKeywords);
  if (textSearchQuery && textSearchQuery.trim().length > 0) modalTitleTerms.push(textSearchQuery.trim());
  // 高亮标题
  const highlightedTitle = modalTitleTerms.length > 0 
    ? highlightMatches(paper.title, modalTitleTerms, 'keyword-highlight') 
    : escapeHtml(paper.title);
  
  // 在标题前添加索引号
  modalTitle.innerHTML = paperIndex ? `<span class="paper-index-badge">${paperIndex}</span> ${highlightedTitle}` : highlightedTitle;
  
  const abstractText = paper.details || '';
  
  const categoryDisplay = paper.allCategories ? 
    paper.allCategories.join(', ') : 
    paper.category;
  
  // 高亮作者（作者过滤 + 文本搜索）
  const modalAuthorTerms = [];
  if (activeAuthors.length > 0) modalAuthorTerms.push(...activeAuthors);
  if (textSearchQuery && textSearchQuery.trim().length > 0) modalAuthorTerms.push(textSearchQuery.trim());
  const highlightedAuthors = modalAuthorTerms.length > 0 
    ? highlightMatches(paper.authors, modalAuthorTerms, 'author-highlight') 
    : escapeHtml(paper.authors);
  
  // 高亮摘要（关键词 + 文本搜索）
  const highlightedSummary = modalTitleTerms.length > 0 
    ? highlightMatches(paper.summary, modalTitleTerms, 'keyword-highlight') 
    : escapeHtml(paper.summary);
  
  // 高亮详情（Abstract/details）
  const highlightedAbstract = modalTitleTerms.length > 0 
    ? highlightMatches(abstractText, modalTitleTerms, 'keyword-highlight') 
    : escapeHtml(abstractText);
  
  // 高亮其他部分（如果存在且是摘要的一部分）
  const highlightedMotivation = paper.motivation && modalTitleTerms.length > 0 
    ? highlightMatches(paper.motivation, modalTitleTerms, 'keyword-highlight') 
    : escapeHtml(paper.motivation);
  
  const highlightedMethod = paper.method && modalTitleTerms.length > 0 
    ? highlightMatches(paper.method, modalTitleTerms, 'keyword-highlight') 
    : escapeHtml(paper.method);
  
  const highlightedResult = paper.result && modalTitleTerms.length > 0 
    ? highlightMatches(paper.result, modalTitleTerms, 'keyword-highlight') 
    : escapeHtml(paper.result);
  
  const highlightedConclusion = paper.conclusion && modalTitleTerms.length > 0 
    ? highlightMatches(paper.conclusion, modalTitleTerms, 'keyword-highlight') 
    : escapeHtml(paper.conclusion);
  
  // 判断是否需要显示高亮说明
  const showHighlightLegend = activeKeywords.length > 0 || activeAuthors.length > 0;
  
  // 添加匹配标记
  const matchedPaperClass = paper.isMatched ? 'matched-paper-details' : '';
  
  const modalContent = `
    <div class="paper-details ${matchedPaperClass}">
      <p><strong>作者: </strong>${highlightedAuthors}</p>
      <p><strong>分类: </strong>${escapeHtml(String(categoryDisplay))}</p>
      <p><strong>归档日期: </strong>${formatDate(paper.date)}</p>
      
      
      ${paperAnnotations(paper)}
      <h3>${paper.hasAI ? '中文概括' : '原始摘要'}</h3>
      <p>${highlightedSummary}</p>
      
      <div class="paper-sections">
        ${paper.motivation ? `<div class="paper-section"><h4>研究动机</h4><p>${highlightedMotivation}</p></div>` : ''}
        ${paper.method ? `<div class="paper-section"><h4>方法</h4><p>${highlightedMethod}</p></div>` : ''}
        ${paper.result ? `<div class="paper-section"><h4>结果</h4><p>${highlightedResult}</p></div>` : ''}
        ${paper.conclusion ? `<div class="paper-section"><h4>结论</h4><p>${highlightedConclusion}</p></div>` : ''}
      </div>
      
      ${paper.hasAI && highlightedAbstract ? `<h3>原始摘要</h3><p class="original-abstract">${highlightedAbstract}</p>` : ''}
      
      <div class="pdf-preview-section">
        <div class="pdf-header">
          <h3>PDF Preview</h3>
          <button class="pdf-expand-btn" onclick="togglePdfSize(this)">
            <svg class="expand-icon" viewBox="0 0 24 24" width="24" height="24">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
            </svg>
            <svg class="collapse-icon" viewBox="0 0 24 24" width="24" height="24" style="display: none;">
              <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
            </svg>
          </button>
        </div>
        <div class="pdf-container">
          <iframe src="${paper.url.replace('abs', 'pdf')}" width="100%" height="800px" frameborder="0"></iframe>
        </div>
      </div>
    </div>
  `;
  
  // Update modal content
  document.getElementById('modalBody').innerHTML = modalContent;
  document.getElementById('paperLink').href = paper.url;
  document.getElementById('pdfLink').href = paper.url.replace('abs', 'pdf');
  document.getElementById('htmlLink').href = paper.url.replace('abs', 'html');
  
  // --- GitHub Button Logic ---
  const githubLink = document.getElementById('githubLink');
  
  if (paper.code_url) {
    githubLink.href = paper.code_url;
    githubLink.style.display = 'flex'; 
    githubLink.title = "View Code on GitHub";
  } else {
    githubLink.style.display = 'none';
  }
  // ---------------------------

  // 提示词来自：https://papers.cool/
  prompt = `请你阅读这篇文章${paper.url.replace('abs', 'pdf')},总结一下这篇文章解决的问题、相关工作、研究方法、做了什么实验及其结果、结论，最后整体总结一下这篇文章的内容`
  document.getElementById('kimiChatLink').href = `https://www.kimi.com/_prefill_chat?prefill_prompt=${prompt}&system_prompt=你是一个学术助手，后面的对话将围绕着以下论文内容进行，已经通过链接给出了论文的PDF和论文已有的FAQ。用户将继续向你咨询论文的相关问题，请你作出专业的回答，不要出现第一人称，当涉及到分点回答时，鼓励你以markdown格式输出。&send_immediately=true&force_search=true`;
  
  // 更新论文位置信息
  const paperPosition = document.getElementById('paperPosition');
  if (paperPosition && currentFilteredPapers.length > 0) {
    paperPosition.textContent = `${currentPaperIndex + 1} / ${currentFilteredPapers.length}`;
  }
  
  if (!modal.classList.contains('active')) lastDetailFocus = document.activeElement;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  document.getElementById('closeModal').focus();
}

function closeModal() {
  const modal = document.getElementById('paperModal');
  const modalBody = document.getElementById('modalBody');
  
  // 重置模态框的滚动位置
  modalBody.scrollTop = 0;
  
  modal.classList.remove('active');
  document.body.style.overflow = '';
  lastDetailFocus?.focus();
}

// 导航到上一篇论文
function navigateToPreviousPaper() {
  if (currentFilteredPapers.length === 0) return;
  
  currentPaperIndex = currentPaperIndex > 0 ? currentPaperIndex - 1 : currentFilteredPapers.length - 1;
  const paper = currentFilteredPapers[currentPaperIndex];
  showPaperDetails(paper, currentPaperIndex + 1);
}

// 导航到下一篇论文
function navigateToNextPaper() {
  if (currentFilteredPapers.length === 0) return;
  
  currentPaperIndex = currentPaperIndex < currentFilteredPapers.length - 1 ? currentPaperIndex + 1 : 0;
  const paper = currentFilteredPapers[currentPaperIndex];
  showPaperDetails(paper, currentPaperIndex + 1);
}

// 显示随机论文
function showRandomPaper() {
  // 检查是否有可用的论文
  if (currentFilteredPapers.length === 0) {
    console.log('No papers available to show random paper');
    return;
  }
  
  // 生成随机索引
  const randomIndex = Math.floor(Math.random() * currentFilteredPapers.length);
  const randomPaper = currentFilteredPapers[randomIndex];
  
  // 更新当前论文索引
  currentPaperIndex = randomIndex;
  
  // 显示随机论文
  showPaperDetails(randomPaper, currentPaperIndex + 1);
  
  // 显示随机论文指示器
  showRandomPaperIndicator();
  
  console.log(`Showing random paper: ${randomIndex + 1}/${currentFilteredPapers.length}`);
}

// 显示随机论文指示器
function showRandomPaperIndicator() {
  // 移除已存在的指示器
  const existingIndicator = document.querySelector('.random-paper-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  // 创建新的指示器
  const indicator = document.createElement('div');
  indicator.className = 'random-paper-indicator';
  indicator.textContent = 'Random Paper';
  
  // 添加到页面
  document.body.appendChild(indicator);
  
  // 3秒后自动移除
  setTimeout(() => {
    if (indicator && indicator.parentNode) {
      indicator.remove();
    }
  }, 3000);
}

function toggleDatePicker() {
  const datePicker = document.getElementById('datePickerModal');
  datePicker.classList.toggle('active');
  
  if (datePicker.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
    
    // 重新初始化日期选择器以确保它反映最新的可用日期
    if (flatpickrInstance) {
      flatpickrInstance.setDate(isRangeMode ? selectedDateBounds : selectedDateBounds[selectedDateBounds.length - 1], false);
    }
  } else {
    document.body.style.overflow = '';
  }
}

function toggleView() {
  currentView = currentView === 'grid' ? 'list' : 'grid';
  document.getElementById('paperContainer').classList.toggle('list-view', currentView === 'list');
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

async function loadPapersByDateRange(startDate, endDate) {
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  const dates = availableDates.filter(date => date >= start && date <= end);
  if (!dates.length) {
    showLoadNotice('所选日期范围暂无归档，请选择其他日期。');
    return;
  }
  return loadPaperDates(dates, start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`);
}

// 清除所有激活的关键词
function clearAllKeywords() {
  activeKeywords = [];
  // renderKeywordTags();
  // 重新渲染论文列表，移除关键词匹配的高亮和优先排序
  renderPapers();
}

// 清除所有作者过滤
function clearAllAuthors() {
  activeAuthors = [];
  renderFilterTags();
  // 重新渲染论文列表，移除作者匹配的高亮和优先排序
  renderPapers();
}

// 切换PDF预览器大小
function togglePdfSize(button) {
  const pdfContainer = button.closest('.pdf-preview-section').querySelector('.pdf-container');
  const iframe = pdfContainer.querySelector('iframe');
  const expandIcon = button.querySelector('.expand-icon');
  const collapseIcon = button.querySelector('.collapse-icon');
  
  if (pdfContainer.classList.contains('expanded')) {
    // 恢复正常大小
    pdfContainer.classList.remove('expanded');
    iframe.style.height = '800px';
    expandIcon.style.display = 'block';
    collapseIcon.style.display = 'none';
    
    // 移除遮罩层
    const overlay = document.querySelector('.pdf-overlay');
    if (overlay) {
      overlay.remove();
    }
  } else {
    // 放大显示
    pdfContainer.classList.add('expanded');
    iframe.style.height = '90vh';
    expandIcon.style.display = 'none';
    collapseIcon.style.display = 'block';
    
    // 添加遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'pdf-overlay';
    document.body.appendChild(overlay);
    
    // 点击遮罩层时收起PDF
    overlay.addEventListener('click', () => {
      togglePdfSize(button);
    });
  }
}
