import { Lexer } from '../src/lexer'
import { bbbMaster } from '../fixtures/bbb'
import { isTaggedTemplateExpression } from 'typescript'

describe('test', () => {
    const lexer = new Lexer()
    it('bbb master', () => {
        lexer.input(bbbMaster)
        let token = lexer.token();
        console.log(token);
        while (token) {
            token = lexer.token()
            console.log(token);
        }
    })
})

