const Benchmark = require('benchmark');
const suite = new Benchmark.Suite()
const { Lexer } = require('./dist/lexer');
const AttrList = require('./tests/attrlist')
const lexer = new Lexer()

const bbbMaster = `#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=2149280,CODECS="mp4a.40.2,avc1.64001f",RESOLUTION=1280x720,NAME="720"
url_0/193039199_mp4_h264_aac_hd_7.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=246440,CODECS="mp4a.40.5,avc1.42000d",RESOLUTION=320x184,NAME="240"
url_2/193039199_mp4_h264_aac_ld_7.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=460560,CODECS="mp4a.40.5,avc1.420016",RESOLUTION=512x288,NAME="380"
url_4/193039199_mp4_h264_aac_7.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=836280,CODECS="mp4a.40.2,avc1.64001f",RESOLUTION=848x480,NAME="480"
url_6/193039199_mp4_h264_aac_hq_7.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=6221600,CODECS="mp4a.40.2,avc1.640028",RESOLUTION=1920x1080,NAME="1080"
url_8/193039199_mp4_h264_aac_fhd_7.m3u8`

const MASTER_PLAYLIST_REGEX = /#EXT-X-STREAM-INF:([^\n\r]*)[\r\n]+([^\r\n]+)/g;

function setCodecs (codecs, level) {
    ['video', 'audio'].forEach((type) => {
        const preferred = codecs.filter((codec) => {
            return codec.lastIndexOf('avc1', 0) === 0 || codec.lastIndexOf('mp4a', 0) === 0;
        });
        
        level[`${type}Codec`] = preferred.length > 0 ? preferred[0] : codecs[0];
    })
}

suite
.add('Lexer - Master', () => {
    lexer.input(bbbMaster)
    let levels = [];
    let token;
    while ((token = lexer.token()) != null) {
        if (token.name === "#EXT-X-STREAM-INF") {    
            const res = token.attributes["RESOLUTION"].split("x")
            const level = {
                bitrate: parseInt(token.attributes["BANDWIDTH"]),
                name: token.attributes["NAME"],
                url: token.attributes["URI"],
                resolution: { width: res[0], height: res[1] },
            };
            levels.push(level)
        }
    }
})
.add('Regex - Master', () => {
    let result;
    let levels = [];
    
    MASTER_PLAYLIST_REGEX.lastIndex = 0;

    while ((result = MASTER_PLAYLIST_REGEX.exec(bbbMaster)) != null) {
      const level = {};
      const attrs = level.attrs = new AttrList(result[1]);
      level.url = result[2]
      level.bitrate = attrs.decimalInteger('AVERAGE-BANDWIDTH') || attrs.decimalInteger('BANDWIDTH');
      level.name = attrs.NAME;
      
      levels.push(level);
    }
})
.on('start', (event) => {
    if (event.target.name === "Lexer - Master") {
        console.profile("lexer-profile")
    }
})
.on('cycle', (event) => {
    if (event.target.name === "Lexer - Master") {
        console.profileEnd("lexer-profile")
    }
    console.log(String(event.target))
})
.on('error', (error) => {
    console.log(error)
})
.on('complete', function() {
    console.log('Fastest is' + this.filter('fastest').map('name'));
})
.run({'async': false});