
declare module "intro.js" {
	interface IntroJs {
		start(): IntroJs;
		goToStep(step: number): IntroJs;
		nextStep(): IntroJs;
		previousStep(): IntroJs;
		exit(): IntroJs;
		setOption(option: string, value: string|number|boolean): IntroJs;
		setOptions(options: { [option: string]: string|number|boolean }): IntroJs;
		refresh(): IntroJs;
		addHints(): IntroJs;
		onhintclick(providedCallback: () => void): IntroJs;
		onhintsadded(providedCallback: () => void): IntroJs;
		onhintclose(providedCallback: () => void): IntroJs;
		oncomplete(providedCallback: () => void): IntroJs;
		onexit(providedCallback: () => void): IntroJs;
		onchange(providedCallback: () => void): IntroJs;
		onbeforechange(providedCallback: () => void): IntroJs;
		onafterchange(providedCallback: (element: HTMLElement) => void): IntroJs;
	}
	
	export function introJs(targetElm?: HTMLElement): IntroJs;
}
