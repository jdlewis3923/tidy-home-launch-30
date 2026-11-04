import { assertEquals } from 'jsr:@std/assert@1';
import { isUrgentReply } from '../_shared/hiring-inbound.ts';

Deno.test('signing trouble is urgent', () => assertEquals(isUrgentReply("Its not letting me sign"), true));
Deno.test('questions are urgent', () => assertEquals(isUrgentReply('Are all my paperwork in order now'), true));
Deno.test('call requests are urgent', () => assertEquals(isUrgentReply('Justin please call me. Thank you'), true));
Deno.test('time picks are urgent', () => assertEquals(isUrgentReply("Let's do 3 pm can you send me the link"), true));
Deno.test('thanks is not urgent', () => assertEquals(isUrgentReply('Thank you'), false));
Deno.test('greeting is not urgent', () => assertEquals(isUrgentReply('Good morning Justin'), false));
Deno.test('tapback is not urgent', () => assertEquals(isUrgentReply(' \u200b👍\u200b to “ Good morning Justin ”'), false));
