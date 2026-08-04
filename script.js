document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const fileInput = document.getElementById('video-input');
    const apiKeyInput = document.getElementById('gemini-api-key');
    const startBtn = document.getElementById('start-btn');
    const dropZone = document.getElementById('drop-zone');
    const fileInfo = document.getElementById('file-info');
    const fileNameDisplay = document.getElementById('file-name');
    
    // Controls 
    const voiceSelect = document.getElementById('voice-profile');
    const aspectRatioSelect = document.getElementById('aspect-ratio');
    const zoomLevelSlider = document.getElementById('zoom-level');
    const zoomValueDisplay = document.getElementById('zoom-value');
    
    // Status Dashboard
    const dashboardSection = document.getElementById('dashboard');
    const mainFormSection = document.getElementById('main-form');
    const stepIndicators = document.querySelectorAll('.step-indicator');
    const currentStatusText = document.getElementById('current-status-text');
    const progressBar = document.getElementById('progress-bar');
    const errorContainer = document.getElementById('error-container');
    const errorText = document.getElementById('error-text');
    const retryBtn = document.getElementById('retry-btn');
    const resultSection = document.getElementById('result-section');
    const downloadBtn = document.getElementById('download-btn');
    const previewVideo = document.getElementById('preview-video');
    const recentProjectsSection = document.getElementById('recent-projects-section');
    const recentProjectsList = document.getElementById('recent-projects-list');
    const clearRecentBtn = document.getElementById('clear-recent-btn');
    const autoRunToggle = document.getElementById('auto-run-toggle');
    
    let selectedFile = null;
    let pollInterval = null;

    // --- Local Storage for Auto Run ---
    const AUTO_RUN_KEY = 'recapai_auto_run';
    if (localStorage.getItem(AUTO_RUN_KEY) === 'true') {
        autoRunToggle.checked = true;
    }
    autoRunToggle.addEventListener('change', (e) => {
        localStorage.setItem(AUTO_RUN_KEY, e.target.checked);
    });

    // --- Local Storage for Recent Projects ---
    const RECENT_PROJECTS_KEY = 'recapai_recent_projects';

    function loadRecentProjects() {
        try {
            const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
            let projects = stored ? JSON.parse(stored) : [];
            // Optional: limit to 10 recent
            projects = projects.slice(0, 10);
            return projects;
        } catch (e) {
            console.error("Failed to load recent projects:", e);
            return [];
        }
    }

    function saveRecentProject(jobId, fileName) {
        const projects = loadRecentProjects();
        const existingIdx = projects.findIndex(p => p.jobId === jobId);
        if (existingIdx !== -1) {
            projects.splice(existingIdx, 1);
        }
        projects.unshift({
            jobId,
            fileName: fileName || `Video_${jobId.substring(0, 6)}`,
            timestamp: Date.now()
        });
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects.slice(0, 10)));
        renderRecentProjects();
    }

    function renderRecentProjects() {
        const projects = loadRecentProjects();
        if (projects.length === 0) {
            recentProjectsSection.classList.add('hidden');
            return;
        }
        
        recentProjectsSection.classList.remove('hidden');
        recentProjectsList.innerHTML = '';
        
        projects.forEach(project => {
            const dateStr = new Date(project.timestamp).toLocaleString('my-MM', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            const item = document.createElement('div');
            item.className = 'w-full flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-500/50 transition-colors cursor-pointer group';
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-slate-700 group-hover:bg-cyan-900 flex flex-col items-center justify-center transition-colors">
                        <i data-lucide="play-circle" class="w-5 h-5 text-cyan-400"></i>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-slate-200 font-['Noto_Sans_Myanmar'] truncate w-40 sm:w-56" title="${project.fileName}">${project.fileName}</p>
                        <p class="text-xs text-slate-500">${dateStr}</p>
                    </div>
                </div>
                <div class="text-slate-400 group-hover:text-cyan-400 transition-colors">
                    <i data-lucide="chevron-right" class="w-5 h-5"></i>
                </div>
            `;
            
            item.addEventListener('click', () => {
                viewRecentProject(project.jobId, project.fileName);
            });
            
            recentProjectsList.appendChild(item);
        });
        
        // Re-initialize icons for newly added HTML
        lucide.createIcons();
    }

    function viewRecentProject(jobId, fileName) {
        hideError();
        mainFormSection.classList.add('hidden');
        recentProjectsSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        
        // Skip polling, directly show completion for an old job
        updateDashboard('completed', 100);
        document.getElementById('current-status-text').innerHTML = `✅ ${fileName} ပြန်လည်ဖွင့်နေသည်...`;
        
        resultSection.classList.remove('hidden');
        
        const streamUrl = `/api/stream/${jobId}`;
        const downloadUrl = `/api/download/${jobId}`;
        
        downloadBtn.href = downloadUrl;
        previewVideo.src = streamUrl;
        previewVideo.classList.remove('hidden');
    }

    clearRecentBtn.addEventListener('click', () => {
        localStorage.removeItem(RECENT_PROJECTS_KEY);
        renderRecentProjects();
    });

    // Initialize recent projects on load
    renderRecentProjects();

    // --- Helpers ---
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    // --- Event Listeners ---
    
    zoomLevelSlider.addEventListener('input', (e) => {
        zoomValueDisplay.textContent = `${e.target.value}%`;
    });

    // File Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-cyan-400', 'bg-cyan-900/20');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-cyan-400', 'bg-cyan-900/20');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-cyan-400', 'bg-cyan-900/20');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });

    // File Click
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    retryBtn.addEventListener('click', () => {
       resetUI();
    });

    function handleFileSelection(file) {
        if (!file.type.startsWith('video/')) {
            showError('ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် (MP4, MOV, MKV) ကိုသာ ရွေးချယ်ပါ။');
            return;
        }
        selectedFile = file;
        fileNameDisplay.textContent = `${file.name} (${formatBytes(file.size)})`;
        fileInfo.classList.remove('hidden');
        hideError();
        
        if (autoRunToggle.checked) {
            startBtn.click();
        }
    }

    startBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showError('Gemini API Key ထည့်သွင်းရန် လိုအပ်ပါသည်။');
            return;
        }
        if (!selectedFile) {
            showError('ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် တစ်ခုရွေးချယ်ပါ။');
            return;
        }

        startProcess(apiKey);
    });

    // --- API Calls ---

    async function startProcess(apiKey) {
        hideError();
        mainFormSection.classList.add('hidden');
        recentProjectsSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        resultSection.classList.add('hidden');
        resetDashboard();

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('apiKey', apiKey);
        formData.append('voiceProfile', voiceSelect.value);
        formData.append('aspectRatio', aspectRatioSelect.value);
        formData.append('zoomLevel', zoomLevelSlider.value);
        
        try {
            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData,
                credentials: 'same-origin'
            });

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                throw new Error("Session expired or authentication required. Please reload the page.");
            }

            if (!response.ok) {
                let errData;
                try {
                    errData = await response.json();
                } catch (e) {
                    throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }
                throw new Error(errData.error || 'Failed to upload video');
            }

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("Invalid JSON response:", text);
                throw new Error("Server returned an invalid response.");
            }
            startPolling(data.jobId);
            
        } catch (error) {
            showError(error.message);
            dashboardSection.classList.add('hidden');
            mainFormSection.classList.remove('hidden');
        }
    }

    function startPolling(jobId) {
        let errorCount = 0;
        
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/status/${jobId}`, { credentials: 'same-origin' });
                const contentType = res.headers.get("content-type");
                
                if (contentType && contentType.includes("text/html")) {
                    throw new Error("Session expired or authentication required. Please reload the page.");
                }

                if (!res.ok) {
                    throw new Error(`Server error: ${res.statusText}`);
                }
                
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch(e) {
                    throw new Error(`Invalid JSON response: ${text.substring(0, 50)}...`);
                }
                
                errorCount = 0; // reset error count
                
                updateDashboard(data.step, data.progress, data.message);

                if (data.status === 'error') {
                    clearInterval(pollInterval);
                    showError(data.error || 'Processing failed');
                    // highlight error step
                    document.getElementById('current-status-text').textContent = '⚠️ လုပ်ဆောင်မှု မအောင်မြင်ပါ';
                    return;
                }

                if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    document.getElementById('current-status-text').textContent = '✅ အောင်မြင်စွာ ပြီးစီးပါပြီ';
                    resultSection.classList.remove('hidden');
                    downloadBtn.href = data.resultUrl;
                    previewVideo.src = data.resultUrl.replace('/api/download/', '/api/stream/');
                    previewVideo.classList.remove('hidden');
                    saveRecentProject(jobId, selectedFile ? selectedFile.name : `Video_${jobId.substring(0,6)}`);
                }
                
            } catch (err) {
                console.error("Polling error:", err);
                errorCount++;
                if (errorCount > 5) {
                    clearInterval(pollInterval);
                    showError("Connection lost: " + err.message);
                }
            }
        }, 2000);
    }

    // --- UI Updates ---

    function resetUI() {
        dashboardSection.classList.add('hidden');
        mainFormSection.classList.remove('hidden');
        renderRecentProjects(); // Also shows if not empty
        hideError();
        if (pollInterval) clearInterval(pollInterval);
        previewVideo.classList.add('hidden');
        previewVideo.src = "";
    }

    function showError(msg) {
        errorContainer.classList.remove('hidden');
        errorText.textContent = msg;
    }

    function hideError() {
        errorContainer.classList.add('hidden');
        errorText.textContent = '';
    }

    function updateDashboard(currentStepId, progress, message) {
        const stepOrder = ['uploading', 'analyzing', 'translating', 'voiceover', 'merging', 'completed'];
        const currentIdx = stepOrder.indexOf(currentStepId);
        
        const myanmarLabels = {
            'uploading': 'ဗီဒီယို တင်ပို့နေသည်...',
            'analyzing': 'အသံနှင့် ပုံရိပ် ခွဲခြမ်းစိတ်ဖြာနေသည်...',
            'translating': 'မြန်မာဘာသာသို့ ပြန်ဆိုနေသည်...',
            'voiceover': 'AI အသံသွင်းနေသည်...',
            'merging': 'ဗီဒီယိုနှင့် အသံ ပေါင်းစပ်နေသည်...',
            'completed': 'အားလုံးပြီးစီးပါပြီ'
        };

        currentStatusText.textContent = message || myanmarLabels[currentStepId] || 'လုပ်ဆောင်နေသည်...';
        
        // Calculate global progress
        let globalProgress = 0;
        if (currentIdx === -1) { globalProgress = 0; }
        else if (currentStepId === 'completed') { globalProgress = 100; }
        else {
            const baseProgress = (currentIdx / (stepOrder.length - 1)) * 100;
            const stepContribution = (progress / 100) * (100 / (stepOrder.length - 1));
            globalProgress = baseProgress + stepContribution;
        }
        progressBar.style.width = `${Math.min(globalProgress, 100)}%`;

        // Update step UI
        stepIndicators.forEach(indicator => {
            const stepId = indicator.dataset.step;
            const stepIdx = stepOrder.indexOf(stepId);
            const iconWrap = indicator.querySelector('.icon-wrapper');
            const iconSvg = indicator.querySelector('svg');
            const textEl = indicator.querySelector('.step-text');
            const loadingSpinner = indicator.querySelector('.loader-spinner');
            
            if (stepIdx < currentIdx || currentStepId === 'completed') {
                // Completed
                iconWrap.classList.replace('bg-slate-800', 'bg-purple-600');
                iconSvg.classList.replace('text-slate-400', 'text-white');
                textEl.classList.replace('text-slate-500', 'text-slate-200');
                if (loadingSpinner) loadingSpinner.classList.add('hidden');
            } else if (stepIdx === currentIdx) {
                // Active
                iconWrap.classList.replace('bg-slate-800', 'bg-cyan-600');
                iconSvg.classList.replace('text-slate-400', 'text-white');
                iconWrap.classList.add('shadow-[0_0_15px_rgba(0,243,255,0.5)]');
                textEl.classList.replace('text-slate-500', 'text-cyan-400');
                if (loadingSpinner) loadingSpinner.classList.remove('hidden');
            } else {
                // Pending
                iconWrap.classList.remove('bg-purple-600', 'bg-cyan-600', 'shadow-[0_0_15px_rgba(0,243,255,0.5)]');
                iconWrap.classList.add('bg-slate-800');
                iconSvg.classList.remove('text-white');
                iconSvg.classList.add('text-slate-400');
                textEl.classList.remove('text-slate-200', 'text-cyan-400');
                textEl.classList.add('text-slate-500');
                if (loadingSpinner) loadingSpinner.classList.add('hidden');
            }
        });
    }

    function resetDashboard() {
        progressBar.style.width = '0%';
        currentStatusText.textContent = 'စတင်နေသည်...';
        stepIndicators.forEach(indicator => {
             const iconWrap = indicator.querySelector('.icon-wrapper');
             const iconSvg = indicator.querySelector('svg');
             const textEl = indicator.querySelector('.step-text');
             const loadingSpinner = indicator.querySelector('.loader-spinner');
             
             iconWrap.className = 'icon-wrapper w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 transition-all duration-300';
             iconSvg.setAttribute('class', 'w-5 h-5 text-slate-400');
             textEl.className = 'step-text text-sm font-medium text-slate-500 transition-colors';
             if (loadingSpinner) loadingSpinner.classList.add('hidden');
        });
    }
});
