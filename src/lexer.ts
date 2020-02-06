interface Token {
    name: string;
    pos: number;
    type: 'Tag' | 'URI' | 'TagWithAttributeList';
}

interface TagWithAttributes extends Token {
    type: 'TagWithAttributeList';
    attributes: AttributeMap;
}

type AttributeTuple = [string, string]
type AttributeMap = Record<string, string>

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

    private isNewline = (c: string): boolean => {
        return c === '\r' || c === '\n'
    }

    private isDigit = (c: string): boolean => {
        return c >= '0' || c <= '9'
    }

    private isUpperAlpha = (c: string): boolean => {
        return c >= 'A' || c <= 'Z'
    }

    private isAlpha = (c: string): boolean => {
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z')
    }

    private isWhitespace = (c: string): boolean => {
        return (c === ' ' || c === '\n' || c === '\t' || c === '\r')
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

    private isHash = (c: string): boolean => {
        return c === '#'
    }

    private isValidLineStart = (c: string): boolean => {
        if (this.isHash(c) || 
            this.isNewline(c) ||
            this.isAlpha(c) || this.isDigit(c)) {
            return true
        }
        return false
    }

    private advancePos = () => {
        while (this.pos <= this.buflen) {
            let c = this.buf[this.pos]
            if (this.isNewline(c)) {
                this.pos++
                c = this.buf[this.pos]
                if (this.isNewline(c)) {
                    this.pos++
                    c = this.buf[this.pos]
                }
                
                if (this.isValidLineStart(c)) {
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
        const c = this.buf[this.pos]
        if (!this.isValidLineStart(c)) {
            return this.advancePos()
        }

        // NOTE: comments are skipped here 
        // if we want to pass them to be handled, we should remove this
        if (c === '#') {
            if (this.buf[this.pos + 1] !== 'E') {
                return this.advancePos()
            }
        }
    }

    private processHash(): Token {
        const pos = this.pos
        const tag = this.buf.slice(pos, this.pos + 4)
        if (tag === '#EXT') {
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

    private processTagValue(name: string, startPos: number): TagWithAttributes {
        // skip ':'
        this.pos++

        switch (name) {
        case '#EXT-X-STREAM-INF':
            const attributes = this.processAttrList()
            this.advancePos()
            const uri = this.processURI()
            attributes["URI"] = uri
            while (this.isNewline(this.buf[this.pos])) {
                this.pos++
            }
            return {
                name,
                pos: startPos,
                type: 'TagWithAttributeList',
                attributes, 
            }
        case '#EXTINF':
            const duration = this.processNumber()
            if (this.buf[this.pos] === ',') {
                this.pos++
            }
            return {
                name,
                pos: startPos,
                type: 'TagWithAttributeList',
                attributes: {
                    duration
                }
            }
        default:
            console.log(`missing tag ${name}`)
        }
    }

    private processAttrList(): Record<string, string> {        
        const attributes = {}
        for (; this.pos < this.buflen; this.pos++) {
            const pair = this.processAttributePair()
            attributes[pair[0]] = pair[1];
            
            let c = this.buf[this.pos]
            // skip ','
            if (c === ',') {
                continue
            } 
            
            if (this.isNewline(c)) {
                break;
            }
        }

        return attributes;
    }

    private processAttributePair(): AttributeTuple {
        let pos = this.pos
        let c = this.buf[this.pos]
        while ((this.isUpperAlpha(c) || c === '-') && c !== '=') {
            this.pos++
            c = this.buf[this.pos]
        }
        const name = this.buf.slice(pos, this.pos)
        this.pos++ // skip '='
        
        pos = this.pos
        // console.log(`processAttributePair - name: ${name}`);
        
        let value;
        c = this.buf[this.pos];
        // quoted-string handling
        if (c === '"') {
            this.pos++
            while (this.buf[this.pos] !== '"') {
                this.pos++
            }
            value = this.buf.slice(pos + 1, this.pos); // skip quote
            this.pos++ // skip quote
        } else {
            while (c !== ',' && !this.isWhitespace(c)) {
                this.pos++
                c = this.buf[this.pos]
            }
            value = this.buf.slice(pos, this.pos);
        }
        
        return [ name, value ]
    }

    private processNumber(): string {
        const pos = this.pos
        let c = this.buf[this.pos]
        while (this.isDigit(c) || c === '.') {
            this.pos++
            c = this.buf[this.pos]
        }
        return this.buf.slice(pos, this.pos)
    }

    private processURI(): string {
        const pos = this.pos
        this.pos = this.buf.indexOf('\n', pos)
        if (this.pos === -1) this.pos = this.buflen;
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