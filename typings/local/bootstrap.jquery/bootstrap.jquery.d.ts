interface JQuery {
	/**
	 * Shows or hides a modal dialog
	 **/
	modal(showOrHide: string);
	modal(options: {
    	backdrop: string;
        keyboard: boolean;
        show: boolean;
    });
	
	serializeObject(): any;
	deserialize(data: any): void;
	
	fileupload(options: {
		url: string;
        dataType: string;
        done: (e, data) => void;
        progressall: (e, data) => void;
        start: (e, data) => void;
        onRemove: (id) => void;
	}): JQuery;
}

interface JQuerySupport {
	fileInput?: boolean;
}
