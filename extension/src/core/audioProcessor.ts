class AudioProcessor extends AudioWorkletProcessor {
  private isProcessing: boolean;

  constructor() {
    super();
    this.isProcessing = true;
    console.log('AudioProcessor initialized');
  }

  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    // Vérifier si nous avons des données audio
    const input = inputs[0];
    if (!input || !input[0] || !this.isProcessing) return false;

    // Obtenir les données audio du premier canal
    const audioData = input[0];
    
    // Envoyer les données au thread principal
    this.port.postMessage({
      type: 'audioData',
      data: Array.from(audioData.slice(0, 100)) // Convertir en Array pour la sérialisation
    });

    return this.isProcessing;
  }
}

// Enregistrer le processeur
registerProcessor('audio-processor', AudioProcessor);
