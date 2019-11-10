class AnswerHow_InferenceEffect extends InferenceEffect {
	constructor(effectParameter:Term) 
	{
		super()
		this.effectParameter = effectParameter;
	}


	execute(inf:InferenceRecord, ai:RuleBasedAI)
	{
		console.log("executeInferenceEffect: INFERENCE_RECORD_EFFECT_ANSWER_HOW");
		console.log("inf.inferences.length: " + inf.inferences.length);
		console.log("inf.inferences[0].endResults: " + inf.inferences[0].endResults);
		

		if (!(this.effectParameter.attributes[1] instanceof ConstantTermAttribute)) {
			console.error("A4RuleBasedAI.executeInferenceEffect: Trying to talk to a character for which we don't know the ID!");
			return;
		}
		var speakerCharacterID:string = (<ConstantTermAttribute>(this.effectParameter.attributes[1])).value;
		var targetID:string = null;

		console.log("query result, answer how (source): " + inf.inferences[0].endResults);
		if (inf.inferences[0].endResults.length == 0) {
			var term:Term = Term.fromString("action.talk('"+ai.selfID+"'[#id], perf.inform.answer('"+speakerCharacterID+"'[#id],'unknown'[symbol]))", ai.o);
			ai.intentions.push(new IntentionRecord(term, null, null, null, ai.time_in_seconds));
		} else {
			// get the location ID
			var how:Term = null;
			var intention:Term = this.effectParameter;
			if (inf.inferences[0].endResults.length != 0) {
				for(let b of inf.inferences[0].endResults[0].bindings.l) {
					if (b[0].name == "HOW") {
						var v:TermAttribute = b[1];
						if (v instanceof TermTermAttribute) {
							how = (<TermTermAttribute>v).term;
							break;
						}
					}
				}
			}
			if (how == null) {
				var term:Term = Term.fromString("action.talk('"+ai.selfID+"'[#id], perf.inform.answer('"+speakerCharacterID+"'[#id],'unknown'[symbol]))", ai.o);
				ai.intentions.push(new IntentionRecord(term, null, null, null, ai.time_in_seconds));
				return;
			}
			var term:Term = Term.fromString("action.talk('"+ai.selfID+"'[#id], perf.inform.answer('"+speakerCharacterID+"'[#id]))", ai.o);
			(<TermTermAttribute>term.attributes[1]).term.attributes.push(new TermTermAttribute(how));
			ai.intentions.push(new IntentionRecord(term, null, null, null, ai.time_in_seconds));
		}	
	}


	saveToXMLInternal(ai:RuleBasedAI, variables:TermAttribute[], variableNames:string[]) : string
	{
		return "<InferenceEffect type=\"AnswerHow_InferenceEffect\" effectParameter=\""+this.effectParameter.toStringXMLInternal(variables, variableNames)+"\"/>";
	}


	static loadFromXML(xml:Element, ai:RuleBasedAI, o:Ontology, variables:TermAttribute[], variableNames:string[]) : InferenceEffect
	{
		let t:Term = Term.fromStringInternal(xml.getAttribute("effectParameter"), o, variableNames, variables).term;
		return new AnswerHow_InferenceEffect(t);
	}


	effectParameter:Term = null;
}