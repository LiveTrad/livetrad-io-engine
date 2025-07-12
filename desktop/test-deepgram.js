const { createClient } = require('@deepgram/sdk');
require('dotenv').config();

async function testDeepgramConnection() {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    
    if (!apiKey) {
        console.error('❌ DEEPGRAM_API_KEY not found in .env file');
        return;
    }

    console.log('🔑 Testing Deepgram API key:', apiKey.substring(0, 10) + '...');
    
    try {
        const deepgram = createClient(apiKey);
        
        // Test simple de connexion
        const connection = deepgram.listen.live({
            language: 'en',
            punctuate: true
        });

        connection.addListener('open', () => {
            console.log('✅ Deepgram connection successful!');
            connection.finish();
            process.exit(0);
        });

        connection.addListener('error', (error) => {
            console.error('❌ Deepgram connection failed:', error);
            process.exit(1);
        });

        // Timeout après 10 secondes
        setTimeout(() => {
            console.error('❌ Connection timeout');
            process.exit(1);
        }, 10000);

    } catch (error) {
        console.error('❌ Error creating Deepgram client:', error);
        process.exit(1);
    }
}

testDeepgramConnection(); 