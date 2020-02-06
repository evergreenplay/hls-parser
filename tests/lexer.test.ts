import { Lexer } from '../src/lexer'
import { bbbMaster } from '../fixtures/bbb'
import { isTaggedTemplateExpression } from 'typescript'

describe('test', () => {
    const lexer = new Lexer()
    it('bbb master', () => {
        lexer.input(bbbMaster)
        let token;
        while ((token = lexer.token()) !== null) {
            console.log(token);
        }
    })
})

