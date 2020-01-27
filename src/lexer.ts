interface Token {
    name: string;
    pos: number;
    type: 'Tag' | 'URI' | 'TagAttributeList';
}

interface TagWithAttributes extends Token {
    type: 'TagAttributeList';
    attributes: AttributeList;
}

interface Attribute {
    name: string; 
    value: string;
}

type AttributeList = Attribute[]

class ParsingError extends Error {
    public name = "ParsingError"
    public line: string;
    
    public constructor(message: string) {
        super(message)
    }
}

export class Lexer {
    private pos: number;
    private buf: string;
    private buflen: number;
    private parseError: Error;

    public input = (buf: string) => {
        this.pos = 0
        this.buf = buf
        this.buflen = buf.length

        
        if (this.isBOM()) {
            this.parseError = new ParsingError("MUST NOT contain a BOM.")
        }
    }

    /**
     * Returns null when there are no more tokens
     * Will throw ParsingError if fails
     */
    public token = (): Token | null => {
        if (this.parseError) {
            throw this.parseError
        }

        if (this.pos >= this.buflen) {
            return null
        }

        this.skipForward()

        switch (this.buf[this.pos]) {
        case '#':
            return this.processHash()
        default:
            console.log('Huh?', this.buf.slice(this.pos))
        }
    }

    private isNewline = (): boolean => {
        const c = this.buf[this.pos]
        return c === '\r' || c === '\n'
    }

    private isDigit = (): boolean => {
        const c = this.buf[this.pos]
        return c >= '0' || c <= '9'
    }

    private isHexDigit = (): boolean => {
        const c = this.buf[this.pos]
        return this.isDigit() || 
            (c >= 'A' && c <= 'F')
    }

    private isUpperAlpha = (): boolean => {
        const c = this.buf[this.pos]
        return c >= 'A' || c <= 'Z'
    }

    private isAlpha = (): boolean => {
        const c = this.buf[this.pos]
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z')
    }

    // this is a poor but quick way of doing this
    private isUriChar = (): boolean => {
        const c = this.buf[this.pos]
        return !this.isWhitespace()
    }

    private isWhitespace = (): boolean => {
        const c = this.buf[this.pos]
        switch (c) {
            case '\t':
            case ' ':
            case '\r':
            case '\n':
                return true
            default:
                return false
        }
    }

    private isBOM = (): boolean => {
        if (this.buf.charCodeAt(this.pos) === 0xEF && 
            this.buf.charCodeAt(this.pos + 1) === 0xBB && 
            this.buf.charCodeAt(this.pos + 2) === 0xBF) {
            return true
        }
        return false
    }

    private isControlCharacter = (): boolean => {
        const code = this.buf.charCodeAt(this.pos)
        if ((code >= 0x0000 && code <= 0x001f) ||
            (code >= 0x007f && code <= 0x009f)) {
                return true
            }
        return false
    }

    private isHash = (): boolean => {
        return this.buf[this.pos] === '#'
    }

    private isValidLineStart = (): boolean => {
        if (this.isHash() || 
            this.isNewline() ||
            this.isAlpha() || this.isDigit()) {
            return true
        }
        return false
    }

    private advancePos = () => {
        while (this.pos <= this.buflen) {
            if (this.isNewline()) {
                this.pos++
                if (this.isNewline()) {
                    this.pos++
                }
                
                if (this.isValidLineStart()) {
                    return
                }

                this.parseError = new ParsingError("Lines are terminated with a single line feed, or a carriage return followed by a line feed.")
            }

            if (this.isControlCharacter()) {
                this.parseError = new ParsingError("MUST NOT contain UTF-8 Control Characters")
            }

            // We haven't reached the end of the comment line
            this.pos++
        }
    }

    private skipForward = () => {
        if (!this.isValidLineStart()) {
            return this.advancePos()
        }

        const c = this.buf[this.pos]
        // NOTE: comments are skipped here 
        // if we want to pass them to be handled, we should remove this
        if (c === '#') {
            if (this.buf[this.pos + 1] !== 'E') {
                return this.advancePos()
            }
        }
    }

    private processHash(): Token {
        const tag = this.buf.slice(this.pos, this.pos + 4)
        if (tag === '#EXT') {
            return this.processTag()
        }
    }

    private peekNextLinePOS(): number {
        let pos = this.pos
        while (pos <= this.buflen) {
            let c = this.buf[pos]
            pos++
            if (c == '\n') {
                return pos
            }
        }
        return pos
    }

    private processTag(): Token {
        // console.log('ProcessTag: ', this.buf.slice(this.pos))
        const pos = this.pos
        const name = this.processTagName()

        if (this.buf[this.pos] === ':') {
            return this.processTagValue(name, pos)
        }

        const endpos = this.peekNextLinePOS()
        this.pos += (endpos - this.pos)

        return {
            name,
            pos,
            type: "Tag"
        }
    }

    private processTagValue(name: string, startPos: number): TagWithAttributes {
        // skip ':'
        this.pos++
        debugger

        switch (name) {
        case '#EXTINF':
            const duration = this.processNumber()
            return {
                name,
                pos: startPos,
                type: 'TagAttributeList',
                attributes: [
                    { name: 'duration', value: duration },
                ]
            }
        case '#EXT-X-STREAM-INF':
            const attributes = this.processAttrList()
            this.advancePos()
            const uri = this.processURI()
            attributes.push({
                name: 'URI',
                value: uri,
            })
            while (this.isNewline()) {
                this.pos++
            }
            return {
                name,
                pos: startPos,
                type: 'TagAttributeList',
                attributes, 
            }
        default:
            console.log(`missing tag ${name}`)
        }
    }

    private processAttrList(): AttributeList {
        // console.log(`processAttrList: ${this.buf.slice(this.pos)}`);
        
        let attributes = []
        while (!this.isNewline()) {
            attributes.push(this.processAttributePair())
            // skip ','
            if (this.buf[this.pos] === ',') {
                this.pos++
            }
        }
        return attributes
    }

    private processAttributePair(): Attribute {
        let pos = this.pos
        while ((this.isUpperAlpha() || this.buf[this.pos] === '-') && 
                this.buf[this.pos] !== '='
            ) {
            this.pos++
        }
        const name = this.buf.slice(pos, this.pos)
        this.pos++ // skip '='
        
        pos = this.pos
        // console.log(`processAttributePair - name: ${name}`);
        
        // quoted-string handling
        if (this.buf[this.pos] === '"') {
            this.pos++
            while (this.buf[this.pos] !== '"') {
                this.pos++
            }
            this.pos++
        } else {
            while (this.buf[this.pos] !== ',' && !this.isWhitespace()) {
                this.pos++
            }
        }
        
        const value = this.buf.slice(pos, this.pos);
        
        // console.log(`processAttributePair - value: ${value}`);
        
        return {
            name,
            value
        }
    }

    private processNumber(): string {
        const pos = this.pos
        while (this.isDigit() || this.buf[this.pos] === '.') {
            this.pos++
        }
        return this.buf.slice(pos, this.pos)
    }

    private processURI(): string {
        const pos = this.pos;
        while (this.isUriChar() && this.pos <= this.buflen) {
            this.pos++
        }
        return this.buf.slice(pos, this.pos)
    }

    private processTagName(): string {
        // look for end of #EXT tag
        const pos = this.pos
        let endpos = pos
        while (this.buf[endpos] !== '\n' && this.buf[endpos] !== ':') {
            endpos++
        }
        
        this.pos += (endpos - pos)
        return this.buf.slice(pos, endpos)
    }
}