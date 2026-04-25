const bcrypt = require('bcrypt');
async function test() {
    try {
        const hash = await bcrypt.hash('test', 10);
        console.log('Hash:', hash);
        const match = await bcrypt.compare('test', hash);
        console.log('Match:', match);
    } catch (e) {
        console.error('Bcrypt error:', e);
    }
}
test();
