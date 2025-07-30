class AudioVisualizer {
    constructor(canvasId, audioContext) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.barWidth = 2;
        this.barSpacing = 1;
        this.gradient = this.createGradient();
        this.animationId = null;
        this.isVisualizing = false;
    }

    createGradient() {
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#00ff88');
        gradient.addColorStop(0.5, '#00a8ff');
        gradient.addColorStop(1, '#9c27b0');
        return gradient;
    }

    connect(source) {
        source.connect(this.analyser);
        // Garder la connexion silencieuse pour éviter la boucle audio
        this.analyser.connect(this.audioContext.destination);
    }

    start() {
        if (this.isVisualizing) return;
        this.isVisualizing = true;
        this.draw();
    }

    stop() {
        this.isVisualizing = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.clear();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    draw() {
        if (!this.isVisualizing) return;

        this.animationId = requestAnimationFrame(() => this.draw());
        
        this.analyser.getByteFrequencyData(this.dataArray);
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        const barCount = Math.floor(this.width / (this.barWidth + this.barSpacing));
        const barWidth = (this.width / barCount) - this.barSpacing;
        let x = 0;
        
        for (let i = 0; i < barCount; i++) {
            const value = this.dataArray[Math.floor(i * (this.dataArray.length / barCount))];
            const barHeight = (value / 255) * this.height;
            
            this.ctx.fillStyle = this.gradient;
            this.ctx.fillRect(
                x, 
                this.height - barHeight, 
                barWidth, 
                barHeight
            );
            
            x += barWidth + this.barSpacing;
        }
    }
}

// Export pour une utilisation avec des modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioVisualizer;
}
