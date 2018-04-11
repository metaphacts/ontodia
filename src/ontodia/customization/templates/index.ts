import { TemplateResolver } from '../props';

export * from './default';
export * from './group';
export * from './standard';

export const DefaultTemplateBundle: TemplateResolver[] = [
    types => undefined,
];
