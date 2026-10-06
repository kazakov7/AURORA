import { Injectable } from '@nestjs/common';

@Injectable()
export class AuroraBatchService {
  getHello(): string {
    return 'Hello World!';
  }
}
