// Configuration file - Obfuscated for public repo
// Decoded at runtime for security

const CONFIG_KEYS = {
    // Obfuscated JSONBin Master Key - decoded at runtime
    get JSONBIN_MASTER_KEY() {
        // Base64 encoded + reversed for basic obfuscation
        const encoded = 'S1lRaWVpelFZTXhIMWVVZWl6UVlneGVYWFgyT0NsWlpKZVRGa05xc21lc3QuOWFhZ1RTaCQwMSQyYSQ=';
        try {
            return atob(encoded).split('').reverse().join('');
        } catch (e) {
            console.error('Failed to decode API key');
            return null;
        }
    }
};

// Export for use in application
if (typeof window !== 'undefined') {
    window.CONFIG_KEYS = CONFIG_KEYS;
}
