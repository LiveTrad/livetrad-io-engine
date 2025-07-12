const { createClient } = require('@deepgram/sdk');
require('dotenv').config();

async function testTranscription() {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    
    if (!apiKey) {
        console.error('❌ DEEPGRAM_API_KEY not found');
        return;
    }

    console.log('🔑 Testing Deepgram transcription...');
    
    try {
        const deepgram = createClient(apiKey);
        
        const connection = deepgram.listen.live({
            language: 'en',
            punctuate: true,
            smart_format: true,
            interim_results: true,
            encoding: 'linear16',
            channels: 1,
            sample_rate: 16000
        });

        connection.addListener('open', () => {
            console.log('✅ Deepgram connected!');
            
            // Envoyer un petit chunk de test (silence)
            const testBuffer = Buffer.alloc(1024, 0); // 1KB de silence
            console.log('📤 Sending test audio chunk...');
            connection.send(testBuffer);
            
            // Attendre un peu puis envoyer un autre chunk
            setTimeout(() => {
                console.log('📤 Sending another test chunk...');
                connection.send(testBuffer);
            }, 1000);
        });

        connection.addListener('transcript', (data) => {
            console.log('🎯 TRANSCRIPT RECEIVED:', data);
            const transcript = data.channel?.alternatives?.[0]?.transcript || '';
            console.log('📝 Text:', transcript);
        });

        connection.addListener('error', (error) => {
            console.error('❌ Error:', error);
        });

        connection.addListener('close', (event) => {
            console.log('🔒 Connection closed:', event);
        });

        // Timeout après 15 secondes
        setTimeout(() => {
            console.log('⏰ Test timeout - closing connection');
            connection.finish();
            process.exit(0);
        }, 15000);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testTranscription(); 