// import { ContextDiagnostics } from "./server/pvsProcess";
//import { PvsFindDeclaration, PvsParserResponse, PvsTypecheckerResponse, XmlRpcResponse } from "./server/common/serverInterface";
import * as fsUtils from "../server/src/common/fsUtils";
import * as test from "./test-constants";
import * as path from 'path';
import { PvsResponse } from "../server/src/common/pvs-gui";
import { PvsProxy } from '../server/src/pvsProxy'; // XmlRpcSystemMethods
import { label, log, dir, configFile, sandboxExamples, safeSandboxExamples, radixExamples } from './test-utils';


//----------------------------
//   Test cases for prover
//----------------------------
describe("pvs-prover", () => {
	let pvsProxy: PvsProxy = null;
	beforeAll(async () => {
		const config: string = await fsUtils.readFile(configFile);
		const content: { pvsPath: string } = JSON.parse(config);
		// log(content);
		const pvsPath: string = content.pvsPath;
		// log("Activating xmlrpc proxy...");
		pvsProxy = new PvsProxy(pvsPath, { externalServer: test.EXTERNAL_SERVER });
		await pvsProxy.activate({ debugMode: true, showBanner: false }); // this will also start pvs-server

		// delete pvsbin files
		await fsUtils.deletePvsCache(sandboxExamples);
	});
	afterAll(async () => {
		// delete pvsbin files
		await fsUtils.deletePvsCache(sandboxExamples);

		if (!test.EXTERNAL_SERVER) {
			// kill pvs server & proxy
			console.log(" killing pvs server...")
			await pvsProxy.killPvsServer();
		}
		await pvsProxy.killPvsProxy();
	});



	// on Linux, pvs-server fails with the following error:  { code: 1, message: '"No methods applicable for generic function #<standard-generic-function all-declarations> with args (nil) of classes (null)"' }
	it(`prove-formula is robust to invocations with incorrect theory names`, async () => {
		label(`prove-formula is robust to invocations with incorrect theory names`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes",
			formulaName: "check_chev_fup_permission",
			theoryName: "pump_th" // pump_th exists, but check_chev_fup_permission is in alaris_th
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).not.toBeDefined();
		expect(response.error).not.toBeDefined();
		expect(response.error.message.startsWith("No methods applicable to generic function")).toBeFalse();

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result).toEqual({ result: 'Unfinished' });
	}, 60000);


	// on Linux, the following test fails and the prover crashes into Lisp
	it(`is robust to prover commands with incorrect arguments`, async () => {
		label(`is robust to prover commands with incorrect arguments`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq",
			rerun: false
		};

		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result.label).toEqual(test.sq_neg_prove_formula.label);
		expect(response.result.sequent).toEqual(test.sq_neg_prove_formula.sequent);

		response = await pvsProxy.proofCommand({ cmd: '(expand "as <")'});
		console.dir(response);
		expect(response.result.commentary).toBeDefined();
		// console.info(response.result.commentary);
		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
	});

	// on Linux, this test fails because the prover ignores the quit command after reporting an error
	it(`is robust to mistyped / malformed prover commands`, async () => {
		label(`is robust to mistyped / malformed prover commands`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq",
			rerun: false
		};

		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result.label).toEqual(test.sq_neg_prove_formula.label);
		expect(response.result.sequent).toEqual(test.sq_neg_prove_formula.sequent);

		// send proof command (skosimp*)
		response = await pvsProxy.proofCommand({ cmd: '(sko)'});
		// console.dir(response);
		expect(response.result.commentary).toBeDefined();
		expect(response.result.commentary[0].endsWith("not a valid prover command")).toBeTruthy();

		response = await pvsProxy.proofCommand({ cmd: '(sko'});
		// console.dir(response);
		expect(response.result.commentary).toBeDefined();
		// console.info(response.result.commentary);
		expect(response.result.commentary[0]).toContain("eof encountered");

		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
	});
	
	// return; // the following tests are completed successfully on Linux -- remove the return statement if you want to run them	

	// on MacOs, pvs-server returns the following message: '"Value #<unknown object of type number 12 @ #x70000001003fc> is not of a type which can be encoded by encode-json."'
	it(`returns proverStatus = inactive after quitting a prover session`, async () => {
		label(`returns proverStatus = inactive after quitting a prover session`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_times",
			theoryName: "sq",
			rerun: false
		};

		// start prover session
		await pvsProxy.proveFormula(desc);
		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
		// check prover status
		const proverStatus: PvsResponse = await pvsProxy.proverStatus();
		expect(proverStatus.result).toEqual("inactive");
	}, 4000);

	// on Mac, pvs-server fails with the following error: { code: 1, message: '"the assertion oplace failed."' },
	it(`can start prover session while parsing files in other contexts`, async () => {
		label(`can start prover session while parsing files in other contexts`);

		// async call to the parser in context safesandbox
		pvsProxy.parseFile({ fileName: "alaris2lnewmodes", fileExtension: ".pvs", contextFolder: safeSandboxExamples });

		// call to prove-formula in sandbox, while the parser is running in the other context
		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes.pump",
			formulaName: "vtbi_over_rate_lemma",
			theoryName: "pump_th"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result).toEqual({ result: 'Unfinished' });
	}, 60000);

	// on Mac, pvs-server does not send a response back to the proxy, and pvs shows an error #<pvs-error @ #x1008b7da82> [condition type: pvs-error]
	it(`reports typecheck error when the prove command is executed but the theory does not typecheck`, async () => {
		label(`reports typecheck error when the prove command is executed but the theory does not typecheck`);

		const desc = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort-test",
			formulaName: "merge_size",
			theoryName: "mergesort_1"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).not.toBeDefined();
		expect(response.error).toBeDefined();
	}, 2000);

	
	// on Mac, pvs-server does not send a response back to the proxy, and pvs shows an error #<pvs-error @ #x1008828e62> [condition type: pvs-error]
	it(`reports error when the prove command is executed but the theory does not exist`, async () => {
		label(`reports error when the prove command is executed but the theory does not exist`);

		let desc = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort-test",
			formulaName: "merge_size",
			theoryName: "mergesort_2"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).not.toBeDefined();
		expect(response.error).toBeDefined();
	}, 2000);


	// on Mac, pvs-server does not send a response back to the proxy, and pvs shows an error #<pvs-error @ #x1008b7da22> [condition type: pvs-error]
	it(`reports error when the prove command is executed but the formula does not exist`, async () => {
		label(`reports error when the prove command is executed but the formula does not exist`);

		const desc = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort-test",
			formulaName: "mm",
			theoryName: "mergesort_1"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).not.toBeDefined();
		expect(response.error).toBeDefined();
	}, 2000);


	// the rationale for the following test case is to check that the following use case:
	// the user has defined formula l in file f1, and another formula with the same name l in file f2;
	// f1 typechecks correctly; f2 does not typecheck; the user tries to prove formula l in f2;
	// pvs-server should not start the proof and return a typecheck error
	it(`is able to distinguish theories with the same name that are stored in different files in the same context`, async () => {
		label(`is able to distinguish theories with the same name that are stored in different files in the same context`);

		// this version of the theory does not typecheck, so the prover should report error
		let desc = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort-test",
			formulaName: "merge_size",
			theoryName: "mergesort"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.info('After proveFormula');
		expect(response.result).not.toBeDefined();
		expect(response.error).toBeDefined();
		// the following command should have no effect
		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result).not.toBeDefined();
		expect(response.error).toBeDefined();

		// this version of the theory, on the other hand, typechecks correctly, so the prover should correctly start a prover session
		desc = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort",
			formulaName: "merge_size",
			theoryName: "mergesort"
		};
		response = await pvsProxy.proveFormula(desc);
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result).toEqual({ result: 'Unfinished' });
		expect(response.error).not.toBeDefined();

	}, 2000);

	//OK
	it(`can start prover session`, async () => {
		label(`can start prover session`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes",
			formulaName: "check_chev_fup_permission",
			theoryName: "alaris_th"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result).toEqual({ result: 'Unfinished' });
	}, 60000);

	// OK
	it(`can start interactive proof session when the formula has already been proved`, async () => {
		label(`can start interactive proof session when the formula has already been proved`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq",
			rerun: false
		};

		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result.label).toEqual(test.sq_neg_prove_formula.label);
		expect(response.result.sequent).toEqual(test.sq_neg_prove_formula.sequent);

		try {
			// send proof command (skosimp*)
			response = await pvsProxy.proofCommand({ cmd: '(skosimp*)'});
			// console.dir(response);
			expect(response.result.commentary[0].trim()).toEqual(test.sq_neg_proof_command_skosimp_star.commentary[0].trim());
			expect(response.result.label).toEqual(test.sq_neg_proof_command_skosimp_star.label);
			expect(response.result.action).toEqual(test.sq_neg_proof_command_skosimp_star.action);
			expect(response.result.sequent).toEqual(test.sq_neg_proof_command_skosimp_star.sequent);

			// send proof command (expand "sq")
			response = await pvsProxy.proofCommand({ cmd: '(expand "sq")'});
			// console.dir(response);
			// expect(response.result.commentary[0].trim()).toEqual(test.sq_neg_expand.commentary[0].trim());
			expect(response.result.label).toEqual(test.sq_neg_expand.label);
			expect(response.result.action).toEqual(test.sq_neg_expand.action);
			expect(response.result.sequent).toEqual(test.sq_neg_expand.sequent);

			// send proof command (assert) to complete the proof
			response = await pvsProxy.proofCommand({ cmd: '(assert)'});
			// console.dir(response);
			expect(response.result).toEqual({ result: 'Q.E.D.' });

			// try to re-start the proof
			response = await pvsProxy.proveFormula(desc);
			// console.dir(response);
			expect(response.result.label).toEqual(test.sq_neg_prove_formula.label);
			expect(response.result.sequent).toEqual(test.sq_neg_prove_formula.sequent);

			// send proof command (skosimp*)
			response = await pvsProxy.proofCommand({ cmd: '(skosimp*)'});
			// console.dir(response);
			expect(response.result.commentary[0].trim()).toEqual(test.sq_neg_proof_command_skosimp_star.commentary[0].trim());
			expect(response.result.label).toEqual(test.sq_neg_proof_command_skosimp_star.label);
			expect(response.result.action).toEqual(test.sq_neg_proof_command_skosimp_star.action);
			expect(response.result.sequent).toEqual(test.sq_neg_proof_command_skosimp_star.sequent);
		}
		finally {
			// quit the proof attempt
			await pvsProxy.proofCommand({ cmd: 'quit'});
		}

	}, 4000);
	
	// OK
	it(`can start a prover session and quit the prover session`, async () => {
		label(`can start a prover session and quit the prover session`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result.sequent).toEqual(test.sq_neg_prove_formula.sequent);

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result).toEqual({ result: 'Unfinished' });
	}, 20000);
	
	// OK
	it(`returns proverStatus = inactive when a prover session is not active`, async () => {
		label(`returns proverStatus = inactive when a prover session is not active`);

		const proverStatus: PvsResponse = await pvsProxy.proverStatus();
		expect(proverStatus.result).toEqual("inactive");
	}, 4000);


	//OK
	it(`returns proverStatus = active when a prover session is active`, async () => {
		label(`returns proverStatus = active when a prover session is active`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_times",
			theoryName: "sq",
			rerun: false
		};

		// start prover session
		await pvsProxy.proveFormula(desc);
		// check prover status
		const proverStatus: PvsResponse = await pvsProxy.proverStatus();
		expect(proverStatus.result).toEqual("active");

		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
	}, 4000);

	// OK
	it(`can invoke prove-formula on theories with parameters`, async () => {
		label(`can invoke prove-formula on theories with parameters`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes",
			formulaName: "check_chev_fup_permission",
			theoryName: "alaris_th" // pump_th exists, but check_chev_fup_permission is in alaris_th
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result).toEqual({ result: 'Unfinished' });
	}, 60000);	

	// OK
	it(`can start prover sessions in theories with parameters`, async () => {
		label(`can start prover sessions in theories with parameters`);

		const desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes.pump",
			formulaName: "vtbi_over_rate_lemma",
			theoryName: "pump_th"
		};
		// await pvsProxy.typecheckFile(desc); // typechecking, if needed, should be performed automatically by prove-formula
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).toBeDefined();

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result).toEqual({ result: 'Unfinished' });
	}, 10000);

});