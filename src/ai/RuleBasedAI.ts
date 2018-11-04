/*

Note (santi):
- This is the core AI class for SHRDLU. It implements all the different elements of the NPC AI. 
- This class is generic, however, and not tied to this specific project, nor to the A4Engine, so it can be separated from the 
  game. Everything that is specific to the game engine is implemented in A4RuleBasedAI, which extends from this class. Then,
  two other classes (EtaoinAI and RobotAI) implement additional functionality used by the two types of NPCs in the game 
  (EtaoinAI is used for ETAOIN which is a disembodied AI, and RobotAI is used for the two robots, QWERTY and SHRDLU).
- These classes implement all the AI functionalities except for pathfinding. For that, I reused all the pathfinding code
  originally implemented in the A4Engine, which is still in the A4AI class inside of the A4Engine code.

*/

var MAXIMUM_ANSWERS_TO_GIVE_AT_ONCE_FOR_A_QUERY:number = 3;

var BACKGROUND_PROVENANCE:string = "background";
var PERCEPTION_PROVENANCE:string = "perception";
var REACTION_PROVENANCE:string = "reaction";
var MEMORIZE_PROVENANCE:string = "memorize";

var MENTION_MEMORY_SIZE:number = 10;

var DEFAULT_QUESTION_PATIENCE_TIMER:number = 1200;

var CONVERSATION_TIMEOUT:number = 60*60;	// 1 minute of real time, which is 1 hour of in-game time

class InferenceRecord {
	constructor(ai:RuleBasedAI, additionalSentences_arg:Sentence[], targets:Sentence[][], p:number, a:number, findAllAnswers:boolean, timeTerm:Term, e:InferenceEffect, o:Ontology)
	{
		// Knowledge base is all the long term knowledge, plus the perception:
		let additionalSentences:Sentence[] = [];
		for(let s of additionalSentences_arg) additionalSentences.push(s);
		for(let te of ai.shortTermMemory.plainTermList) {
			additionalSentences.push(new Sentence([te.term],[true]));
		}

		let ltm:SentenceContainer = ai.longTermMemory;

		if (timeTerm != null) {
			// edit the long term memory to match the time of the query:
			if (timeTerm.functor.name == "time.past") {
				ltm = TimeInference.applyTimePast(ai.longTermMemory)
			} else if (timeTerm.functor.is_a(o.getSort("time.now"))) {
				// do nothing
			} else {
				console.error("InferenceRecord timeTerm not supported: " + timeTerm);
			}
		}

		this.targets = targets;
		for(let target of this.targets) {
			this.inferences.push(new InterruptibleResolution(ltm, additionalSentences, target, true, true, timeTerm == null, ai));
		}
		this.priority = p;
		this.anxiety = a;
		this.additionalSentences = additionalSentences_arg;
		this.findAllAnswers = findAllAnswers;
		this.timeTerm = timeTerm;
		this.effect = e;
	}


	static fromXML(xml:Element, o:Ontology, ai:RuleBasedAI) : InferenceRecord
	{
		let variables:TermAttribute[] = [];
		let variableNames:string[] = [];
		var p:number = Number(xml.getAttribute("priority"));
		var a:number = Number(xml.getAttribute("anxiety"));
		var findAllAnswers:boolean = xml.getAttribute("findAllAnswers") == "true";
		var e:InferenceEffect = null;
		var tt:Term = null;
		var tb:Term = null;
		var tbs:string = null;
		if (xml.getAttribute("timeTerm") != null) tt = Term.fromStringInternal(xml.getAttribute("timeTerm"), o, variableNames, variables);
		if (xml.getAttribute("triggeredBy") != null) tb = Term.fromStringInternal(xml.getAttribute("triggeredBy"), o, variableNames, variables);
		if (xml.getAttribute("triggeredBySpeaker") != null) tbs = xml.getAttribute("triggeredBySpeaker");

		let effect_xml:Element = getFirstElementChildrenByTag(xml ,"InferenceEffect");
		if (effect_xml != null) e = InferenceEffectFactory.loadFromXML(effect_xml, ai, o, variables, variableNames);

		var additionalSentences:Sentence[] = [];
		var additionalSentences_xml:Element = getFirstElementChildrenByTag(xml ,"additionalSentences");
		if (additionalSentences_xml != null) {
			for(let s_xml of getElementChildrenByTag(additionalSentences_xml, "sentence")) {
				var s:Sentence = Sentence.fromStringInternal(s_xml.firstChild.nodeValue, o, variableNames, variables);
				if (s!=null) additionalSentences.push(s);
			}
		}
		var targets:Sentence[][] = [];
		for(let s_l_xml of getElementChildrenByTag(xml, "target")) {
			var t:Sentence[] = [];
			for(let s_xml of getElementChildrenByTag(s_l_xml, "sentence")) {
				var s:Sentence = Sentence.fromStringInternal(s_xml.firstChild.nodeValue, o, variableNames, variables);
				if (s!=null) t.push(s);
			}
			targets.push(t);
		}

		let ir:InferenceRecord = new InferenceRecord(ai, additionalSentences, targets, p, a, findAllAnswers, tt, e, o);
		ir.triggeredBy = tb;
		ir.triggeredBySpeaker = tbs;
		return ir;
	}


	saveToXML(ai:RuleBasedAI) : string
	{
		// We do not save the state of the interruptible resolution process, sicne that'd be complex. 
		// The inference will just be restarted when the AI is loaded again:
		let variables:TermAttribute[] = [];
		let variableNames:string[] = [];
		let str:string = "<InferenceRecord priority=\""+this.priority+"\" "+
										  "anxiety=\""+this.anxiety+"\" "+
										  "findAllAnswers = \""+this.findAllAnswers+"\" "+
										  (this.timeTerm != null ? "timeTerm = \""+this.timeTerm.toStringXMLInternal(variables, variableNames)+"\" ":"") +
										  (this.triggeredBy != null ? "triggeredBy = \""+this.triggeredBy.toStringXMLInternal(variables, variableNames)+"\" ":"") +
										  (this.triggeredBySpeaker != null ? "triggeredBySpeaker = \""+this.triggeredBySpeaker+"\" ":"") +
										  ">\n";

		if (this.effect != null) str += this.effect.saveToXMLInternal(ai, variables, variableNames) + "\n";

		console.error("InferenceRecord saving to XML not yet supported (figure out a way to save InferenceEffects)");

		if (this.additionalSentences.length > 0) {
			str += "<additionalSentences>\n";
			for(let s of this.additionalSentences) {
				str += "<sentence>"+s.toStringXMLInternal(variables, variableNames)+"</sentence>\n";
			}
			str += "</additionalSentences>\n";
		}
		for(let sl of this.targets) {
			str += "<target>\n";
			for(let s of sl) {
				str += "<sentence>"+s.toStringXMLInternal(variables, variableNames)+"</sentence>\n";
			}
			str += "</target>\n";
		}
		str += "</InferenceRecord>";
		return str;
	}


	targets:Sentence[][] = [];
	inferences:InterruptibleResolution[] = [];
	completedInferences:InterruptibleResolution[] = [];
	additionalSentences:Sentence[] = [];

	priority:number = 1;
	anxiety:number = 0;
	findAllAnswers:boolean = false;
	timeTerm:Term = null;

	effect:InferenceEffect = null;

	triggeredBy:Term = null;
	triggeredBySpeaker:string = null;	
}


class CauseRecord {
	constructor(t:Term, c:CauseRecord, time:number)
	{
		this.term = t;
		this.cause = c;
		this.timeStamp = time;
	}


	static fromXML(xml:Element, o:Ontology) : CauseRecord
	{
		var cause:CauseRecord = null;
		var p_xml = getFirstElementChildrenByTag(xml, "cause");
		if (p_xml != null) {
			cause = CauseRecord.fromXML(p_xml, o);
		}
		return new CauseRecord(Term.fromString(xml.getAttribute("term"), o),
							   cause,
							   Number(xml.getAttribute("timeStamp")));
	}


	saveToXML() : string
	{
		if (this.cause == null) {
			var tmp:string = "<CauseRecord term=\""+this.term.toStringXML() +"\" " +
										  "timeStamp=\""+this.timeStamp+"\"/>";
		    return tmp;
		} else {
			var tmp:string = "<CauseRecord term=\""+this.term.toStringXML() +"\" " +
										  "timeStamp=\""+this.timeStamp+"\">";
		    tmp += this.cause.saveToXML();
		    tmp +="</CauseRecord>"

		    return tmp;
		}
	}


	term:Term = null;
	cause:CauseRecord = null;
	timeStamp:number = null;

}


class IntentionRecord {
	constructor(a:Term, r:TermAttribute, rp:NLContextPerformative, c:CauseRecord, time:number)
	{
		this.action = a;
		this.requester = r;
		this.requestingPerformative = rp;
		this.cause = c;
		this.timeStamp = time;
	}


	static fromXML(xml:Element, ai:RuleBasedAI, o:Ontology) : IntentionRecord
	{
		let variables:TermAttribute[] = [];
		let variableNames:string[] = [];
		let action:Term = Term.fromStringInternal(xml.getAttribute("action"), o, variableNames, variables);
		let requester:TermAttribute = null;
		let rps:string = xml.getAttribute("requestingPerformativeSpeaker");
		let requestingPerformative:NLContextPerformative = null;
		let cause:CauseRecord = null;
		let timeStamp:number = Number(xml.getAttribute("timeStamp"));
		if (xml.getAttribute("requester") != null) requester = Term.parseAttribute(xml.getAttribute("requester"), o, variableNames, variables);
		if (rps != null) {
			let context:NLContext = ai.contextForSpeaker(rps);
			if (context != null) {
				requestingPerformative = context.performatives[Number(xml.getAttribute("requestingPerformativeSpeaker"))];
			}
		}
		let cause_xml:Element = getFirstElementChildrenByTag(xml, "CauseRecord");
		if (cause_xml != null) {
			cause = CauseRecord.fromXML(cause_xml, o);
		}
		return new IntentionRecord(action, requester, requestingPerformative, cause, timeStamp);
	}


	saveToXML(ai:RuleBasedAI) : string
	{
		let variables:TermAttribute[] = [];
		let variableNames:string[] = [];
		let context:NLContext = null;
		if (this.requestingPerformative != null) {
			context = ai.contextForSpeaker(this.requestingPerformative.speaker);
		}
		let xml:string = "<IntentionRecord action=\""+this.action.toStringXMLInternal(variables, variableNames)+"\""+
										 (this.requester == null ? "":
										 						   " requester=\""+this.requester.toStringXMLInternal(variables, variableNames)+"\"")+
										 (context == null ? "":
										 				    " requestingPerformativeSpeaker=\""+this.requestingPerformative.speaker+"\""+
										 				    " requestingPerformative=\""+context.performatives.indexOf(this.requestingPerformative)+"\"")+
										 " timeStamp=\""+this.timeStamp+"\"";										 
		if (this.cause == null) {
			xml += "/>";
		} else {
			xml += ">\n";
		    xml += this.cause.saveToXML();
		    xml +="</IntentionRecord>";
		}
		return xml;
	}


	action:Term = null;
	requester:TermAttribute = null;
	requestingPerformative:NLContextPerformative = null;
	cause:CauseRecord = null;	// if it had a cause, other than bing requested by "requester", we specify it here
	timeStamp:number = null;
}


abstract class IntentionAction {
	abstract canHandle(intention:Term, ai:RuleBasedAI) : boolean;
	abstract execute(ir:IntentionRecord, ai:RuleBasedAI) : boolean;

	abstract saveToXML(ai:RuleBasedAI) : string;

	// This is what will be executed all the other times except the first. When it returns "true", action is over
	executeContinuous(ai:RuleBasedAI) : boolean
	{
		return true;
	}

	needsContinuousExecution:boolean = false;
}


abstract class InferenceEffect {
	abstract execute(inf:InferenceRecord, ai:RuleBasedAI);
	abstract saveToXMLInternal(ai:RuleBasedAI, variables:TermAttribute[], variableNames:string[]) : string;

	saveToXML(ai:RuleBasedAI) : string
	{
		return this.saveToXMLInternal(ai, [], []);
	}
}


class RuleBasedAI {
	constructor(o:Ontology, nlp:NLParser, pf:number, pfoffset:number, qpt:number)
	{
		this.o = o;
		this.naturalLanguageParser = nlp;
		this.perceptionFrequency = pf;
		this.perceptionFrequencyOffset = pfoffset;
		this.questionPatienceTimmer = qpt;

		this.cache_sort_name = this.o.getSort("name");
		this.cache_sort_space_at = this.o.getSort("space.at");
		this.cache_sort_time_current = this.o.getSort("time.current");
		this.cache_sort_number = this.o.getSort("number");
		this.cache_sort_symbol = this.o.getSort("symbol");
		this.cache_sort_id = this.o.getSort("#id");
		this.cache_sort_map = this.o.getSort("map");
		this.cache_sort_intention = this.o.getSort("intention");
		this.cache_sort_performative = this.o.getSort("performative");
		this.cache_sort_property = this.o.getSort("property");
		this.cache_sort_property_with_value = this.o.getSort("property-with-value");
		this.cache_sort_relation_with_value = this.o.getSort("relation-with-value");
		this.cache_sort_object = this.o.getSort("object");
		this.cache_sort_space_location = this.o.getSort("space.location");
		this.cache_sort_relation = this.o.getSort("relation");
		this.cache_sort_verb_have = this.o.getSort("verb.have");
		this.cache_sort_verb_contains = this.o.getSort("relation.contains");
		this.cache_sort_stateSort = this.o.getSort("#stateSort");
		this.cache_sort_action_talk = this.o.getSort("action.talk");
		this.cache_sort_action_follow = this.o.getSort("verb.follow");
	}


	update(timeStamp:number) 
	{
		this.time_in_seconds = timeStamp;

		// 1) Attention & Perception:
		if ((timeStamp%this.perceptionFrequency) == this.perceptionFrequencyOffset) {
			this.attentionAndPerception();
		}

		// 2) Short-term memory loop:
		this.shortTermMemory.activationUpdate();

		// 3) Rule execution:
		this.inferenceUpdate();

		// 4) Conversation context update (see if we need to reask questions):
		this.conversationUpdate();

		// 5) Intention execution:
		this.executeIntentions();
	}


	addLongTermTerm(t:Term, provenance:string)
	{
		// intentions:
		if (t.functor == this.cache_sort_intention) {
			this.intentions.push(new IntentionRecord(
									(<TermTermAttribute>t.attributes[0]).term, 
								   	t.attributes.length > 0 ? t.attributes[1]:null,
								   	null,
								   	null,
								   	this.time_in_seconds));
			return;
		}

		if (t.functor.is_a(this.cache_sort_stateSort)) {
			if (this.longTermMemory.addStateSentenceIfNew(new Sentence([t],[true]), provenance, 1, this.time_in_seconds)) {
				// term added
				for(let context of this.contexts) {
					context.newLongTermStateTerm(t);
				}
				this.reactiveBehaviorUpdate(t);
			}
		} else {		
			if (this.longTermMemory.addSentenceIfNew(new Sentence([t],[true]), provenance, 1, this.time_in_seconds)) {
				// term added
				for(let context of this.contexts) {
					context.newLongTermTerm(t);
				}
				this.reactiveBehaviorUpdate(t);
			}
		}
	}


	removeLongTermTermMatchingWith(t:Term) 
	{
		let se:SentenceEntry = this.longTermMemory.containsUnifyingTerm(t);
		if (se != null) this.longTermMemory.removeInternal(se);
	}


	addShortTermTerm(t:Term, provenance:string)
	{
		if (!this.shortMemoryToLongTermMemoryFilter(t, provenance)) {
			// intentions:
			if (t.functor == this.cache_sort_intention) {
				this.intentions.push(new IntentionRecord(
										(<TermTermAttribute>t.attributes[0]).term, 
									   	t.attributes.length > 0 ? t.attributes[1]:null,
									   	null, 
									   	null,
									   	this.time_in_seconds));

				return;
			}

			// we add 1 since "this.shortTermMemory.activationUpdate()" will be executed immediately
			// afterwards, decreasing it by 1 right away.
			if (t.functor.is_a(this.cache_sort_stateSort)) {
				if (this.shortTermMemory.addStateTermIfNew(t, provenance, this.perceptionMemoryTime+1, this.time_in_seconds)) {
					// new term was added:
					this.reactiveBehaviorUpdate(t);
				}
			} else {
				if (this.shortTermMemory.addTermIfNew(t, provenance, this.perceptionMemoryTime+1, this.time_in_seconds)) {
					// new term was added:
					this.reactiveBehaviorUpdate(t);
				}
			}
		}
	}


	addLongTermRuleNow(s:Sentence, provenance:string)
	{
		this.longTermMemory.addSentence(s, provenance, 1, this.time_in_seconds);
	}


	addLongTermRule(s:Sentence, provenance:string, time:number)
	{
		this.longTermMemory.addSentence(s, provenance, 1, time);
	}


	loadLongTermRulesFromXML(xml:Element)
	{
		for(let sentence_xml of getElementChildrenByTag(xml,"sentence")) {
			let rule:Sentence = Sentence.fromString(sentence_xml.getAttribute("sentence"), this.o);
			let provenance:string = sentence_xml.getAttribute("provenance");
			let time:number = this.time_in_seconds;
			if (sentence_xml.getAttribute("time") != null) time = Number(sentence_xml.getAttribute("time"));
			let se:SentenceEntry = this.longTermMemory.addSentence(rule, provenance, 1, time);
			sentence_xml = getFirstElementChildrenByTag(sentence_xml,"previousSentence");
			while(sentence_xml != null) {
				let rule:Sentence = Sentence.fromString(sentence_xml.getAttribute("sentence"), this.o);
				let provenance:string = sentence_xml.getAttribute("provenance");
				let time:number = this.time_in_seconds;
				let timeEnd:number = this.time_in_seconds;
				if (sentence_xml.getAttribute("time") != null) time = Number(sentence_xml.getAttribute("time"));
				if (sentence_xml.getAttribute("timeEnd") != null) timeEnd = Number(sentence_xml.getAttribute("timeEnd"));
				let se2:SentenceEntry = this.longTermMemory.addPreviousSentence(rule, provenance, 1, time, timeEnd, se);
				se = se2;
				sentence_xml = getFirstElementChildrenByTag(sentence_xml,"previousSentence");
			}
		}
		for(let sentence_xml of getElementChildrenByTag(xml,"previousSentence")) {
			let rule:Sentence = Sentence.fromString(sentence_xml.getAttribute("sentence"), this.o);
			let provenance:string = sentence_xml.getAttribute("provenance");
			let time:number = this.time_in_seconds;
			let timeEnd:number = this.time_in_seconds;
			if (sentence_xml.getAttribute("time") != null) time = Number(sentence_xml.getAttribute("time"));
			if (sentence_xml.getAttribute("timeEnd") != null) timeEnd = Number(sentence_xml.getAttribute("timeEnd"));
			this.longTermMemory.addPreviousSentence(rule, provenance, 1, time, timeEnd, null);			
		}
	}


	attentionAndPerception()
	{

	}


	clearPerception()
	{
		this.perceptionBuffer = [];
	}


	addTermToPerception(term:Term)
	{
		this.perceptionBuffer.push(term);
		this.perceptionToShortMemoryFilter(term);
	}


	perceptionToShortMemoryFilter(term:Term) : boolean
	{
		/*
		var action:Sort = this.o.getSort("actionverb");
		if (action.subsumes(term.functor)) {
			this.addShortTermTerm(term);
			return true;
		}
		return false;
		*/

		// only filter time:
		if (term.functor == this.cache_sort_time_current) {
			return false;
		}
		this.addShortTermTerm(term, PERCEPTION_PROVENANCE);
		return true;
	}


	shortMemoryToLongTermMemoryFilter(term:Term, provenance:string) : boolean
	{
		if (this.cache_sort_action_talk.subsumes(term.functor) ||
			this.cache_sort_space_at.subsumes(term.functor)) {
			this.addLongTermTerm(term, provenance);
			return true;
		}

		return false;
	}


	reactiveBehaviorUpdate(t:Term)
	{
		var toAdd:Term[] = [];

		if (t.functor.is_a(this.cache_sort_action_talk) &&
			t.attributes[3] instanceof TermTermAttribute &&
			t.attributes[2] instanceof ConstantTermAttribute &&
			t.attributes[1] instanceof ConstantTermAttribute) {
			// perceived someone talking:
			var performative:Term = (<TermTermAttribute>t.attributes[3]).term;
			var text:string = <string>(<ConstantTermAttribute>t.attributes[2]).value;
			var speaker:string = (<ConstantTermAttribute>t.attributes[1]).value;

			if (speaker != this.selfID) {
				// is it talking to us?
				var context:NLContext = this.contextForSpeaker(speaker);

				if (this.talkingToUs(context, speaker, performative)) {
	    			// Since now we know they are talking to us, we can unify the LISTENER with ourselves:
					let perf2:Term = this.naturalLanguageParser.unifyListener(performative, this.selfID);

					let nIntentions:number = this.intentions.length;
					let tmp:Term[] = this.reactToPerformative(perf2, t.attributes[1], context);
					if (tmp!=null) toAdd = toAdd.concat(tmp);
					let nlcp:NLContextPerformative[] = context.newPerformative(speaker, text, perf2, null, this.o, this.time_in_seconds);
					// add this performative to all the new intentions:
					if (nlcp.length > 0) {
						for(let i:number = nIntentions;i<this.intentions.length;i++) {
							if (this.intentions[i].requestingPerformative == null) {
								this.intentions[i].requestingPerformative = nlcp[0];
							}
						}
					}
				}
			}
		}
		for(let t2 of toAdd) {
			console.log("reactiveBehaviorUpdate.toAdd: " + t2);
			this.addShortTermTerm(t2, REACTION_PROVENANCE);
		}
	}


	reactiveBehaviorUpdateToParseError(speakerID:string)
	{
    	var context:NLContext = this.contextForSpeakerWithoutCreatingANewOne(speakerID);
    	if (context != null) {
    		if (this.talkingToUs(context, speakerID, null)) {
	    		// respond!
	    		if (this.naturalLanguageParser.error_semantic) {
	    			console.log(this.selfID + ": semantic error when parsing a performative from " + speakerID);
	    			this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.parseerror('"+context.speaker+"'[#id], #not(verb.understand('"+this.selfID+"'[#id], #and(S:[sentence],the(S, [singular]))))))", this.o), null, null, null, this.time_in_seconds));
	    		} else if (this.naturalLanguageParser.error_deref.length > 0) {
	    			var tmp:TermAttribute = null;
	    			var errorType:number = 0;
	    			var tokensLeftToParse:number = null;
	    			for(let e of this.naturalLanguageParser.error_deref) {
		    			if (e.derefFromContextErrors.length>0) {
		    				if (tokensLeftToParse == null || e.tokensLeftToParse < tokensLeftToParse) {
		    					tmp = e.derefFromContextErrors[0];
		    					errorType = e.derefErrorType;
		    					tokensLeftToParse = e.tokensLeftToParse;
			    				console.log("reporting derefFromContextErrors:"  + tmp);
			    			}
		    			} else if (e.derefUniversalErrors.length>0) {
		    				if (tokensLeftToParse == null || e.tokensLeftToParse < tokensLeftToParse) {
		    					tmp = e.derefUniversalErrors[0];
		    					errorType = e.derefErrorType;
		    					tokensLeftToParse = e.tokensLeftToParse;
			    				console.log("reporting derefUniversalErrors: " + tmp);
			    			}
		    			} else if (e.derefHypotheticalErrors.length>0) {
		    				if (tokensLeftToParse == null || e.tokensLeftToParse < tokensLeftToParse) {
			    				tmp = e.derefHypotheticalErrors[0];
			    				errorType = e.derefErrorType;
			    				tokensLeftToParse = e.tokensLeftToParse;
				    			console.log("reporting derefHypotheticalErrors: " + tmp);
				    		}
		    			} else if (e.derefQueryErrors.length>0) {
		    				if (tokensLeftToParse == null || e.tokensLeftToParse < tokensLeftToParse) {
			    				tmp = e.derefQueryErrors[0];
			    				errorType = e.derefErrorType;
				    			console.log("reporting derefQueryErrors: " + tmp);
				    			tokensLeftToParse = e.tokensLeftToParse;
				    		}
		    			}
		    			// some times there are many entries with error of type "DEREF_ERROR_CANNOT_PROCESS_EXPRESSION",
		    			// if there are entries with another type of error, prioritize those:
		    			//if (errorType == DEREF_ERROR_NO_REFERENTS ||
		    			//	errorType == DEREF_ERROR_CANNOT_DISAMBIGUATE) break;
	    			}

	    			if (errorType == DEREF_ERROR_NO_REFERENTS) {
		    			this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.parseerror('"+context.speaker+"'[#id], #not(verb.see('"+this.selfID+"'[#id], "+tmp+"))))", this.o), null, null, null, this.time_in_seconds));
	    			} else if (errorType == DEREF_ERROR_CANNOT_DISAMBIGUATE) {
		    			this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.parseerror('"+context.speaker+"'[#id], #not(verb.can('"+this.selfID+"'[#id], verb.disambiguate('"+this.selfID+"'[#id], "+tmp+")))))", this.o), null, null, null, this.time_in_seconds));
	    			} else {
		    			this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.parseerror('"+context.speaker+"'[#id], #not(verb.understand('"+this.selfID+"'[#id], "+tmp+"))))", this.o), null, null, null, this.time_in_seconds));
	    			}
	    		} else if (this.naturalLanguageParser.error_unrecognizedTokens.length > 0) {
	    			this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.parseerror('"+context.speaker+"'[#id], #not(verb.understand('"+this.selfID+"'[#id], '"+this.naturalLanguageParser.error_unrecognizedTokens[0]+"'[symbol]))))", this.o), null, null, null, this.time_in_seconds));
	    		} else if (this.naturalLanguageParser.error_grammatical) {
	    			this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.parseerror('"+context.speaker+"'[#id], #not(verb.can('"+this.selfID+"'[#id], verb.parse('"+this.selfID+"'[#id], #and(S:[sentence],the(S, [singular])))))))", this.o), null, null, null, this.time_in_seconds));
	    		}
	    	} else {
	    		console.log("reactiveBehaviorUpdateToParseError("+this.selfID+"): no need to react, since we are not currently talking to " + speakerID);
	    	}
    	} else {
    		console.log("reactiveBehaviorUpdateToParseError("+this.selfID+"): no need to react, since we don't have a context for " + speakerID);
    	}
	}


	reactToPerformative(perf2:Term, speaker:TermAttribute, context:NLContext) : Term[]
	{
		var reaction:Term[] = [];
		var performativeHandled:boolean = false;
		var newExpectingThankyou:boolean = false;

		if (context.expectingAnswerToQuestion_stack.length > 0) {
			if (perf2.functor.name == "perf.inform") {
				// determine if it's a proper answer:
				reaction = this.reactToAnswerPerformative(perf2, speaker, context);
				if (reaction == null) {
					var t2:Term = Term.fromString("action.memorize('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
					t2.addAttribute(perf2.attributes[1]);
					this.intentions.push(new IntentionRecord(t2,null,context.getNLContextPerformative(perf2), null, this.time_in_seconds));
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.invalidanswer('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], "+context.expectingAnswerToQuestion_stack[context.expectingAnswerToQuestion_stack.length-1].performative+")", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
					context.popLastQuestion();	// remove the question, since we will ask it again
				}
				performativeHandled = true;
			} else if (perf2.functor.is_a(this.o.getSort("perf.inform.answer")) ||
					   perf2.functor.is_a(this.o.getSort("perf.ack.ok"))) {
				// determine if it's a proper answer:
				reaction = this.reactToAnswerPerformative(perf2, speaker, context);
				if (reaction == null) {
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.invalidanswer('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], "+context.expectingAnswerToQuestion_stack[context.expectingAnswerToQuestion_stack.length-1].performative+")", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
					context.popLastQuestion();	// remove the question, since we will ask it again
				}
				performativeHandled = true;
			} else if (perf2.functor.is_a(this.o.getSort("perf.question"))) {
				// in this case, we accept the performative. It will be handled below
			} else if (perf2.functor.is_a(this.o.getSort("perf.request.action"))) {
				// in this case, we accept the performative. It will be handled below
			} else {
				this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.invalidanswer('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
				this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], "+context.expectingAnswerToQuestion_stack[context.expectingAnswerToQuestion_stack.length-1].performative+")", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
				context.popLastQuestion();	// remove the question, since we will ask it again
				performativeHandled = true;
			}

		} else if (context.expectingConfirmationToRequest_stack.length > 0) {
		    if (perf2.functor.is_a(this.o.getSort("perf.ack.ok"))) {
		    	// ok, clear requests:
		    	context.expectingConfirmationToRequest_stack = [];
		    	context.expectingConfirmationToRequestTimeStamp_stack = [];
		    	performativeHandled = true;
		    } else if (perf2.functor.is_a(this.o.getSort("perf.ack.denyrequest"))) {
		    	context.expectingConfirmationToRequest_stack = [];
		    	context.expectingConfirmationToRequestTimeStamp_stack = [];
		    	performativeHandled = true;

				var term:Term = Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.ok('"+context.speaker+"'[#id]))", this.o);
				this.intentions.push(new IntentionRecord(term, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} if (perf2.functor.is_a(this.o.getSort("perf.inform.answer"))) {
				// TODO: we should probably check if it's a valid answer, but for now just clear the queues
		    	context.expectingConfirmationToRequest_stack = [];
		    	context.expectingConfirmationToRequestTimeStamp_stack = [];
		    	performativeHandled = true;

		    	if (perf2.attributes.length>=2 &&
		    		perf2.attributes[1] instanceof ConstantTermAttribute) {
		    		var answer:string = (<ConstantTermAttribute>perf2.attributes[1]).value;
		    		if (answer == "no") {
						var term:Term = Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.ok('"+context.speaker+"'[#id]))", this.o);
						this.intentions.push(new IntentionRecord(term, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
		    		}
		    	}
			}
		}

		if (!performativeHandled) {
			if (perf2.functor.name == "perf.callattention") {
				if (context.speaker == "david") {
					// we only confirm to the player, since otherwise, the AIs get all confused in loops some times
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.answer('"+context.speaker+"'[#id],'yes'[symbol]))", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
				}
			} else if (perf2.functor.name == "perf.greet") {
				if (!context.expectingGreet) {
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.greet('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
				}
			} else if (perf2.functor.name == "perf.farewell") {
				if (!context.expectingFarewell) {
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.farewell('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
				}
				context.inConversation = false;
			} else if (perf2.functor.name == "perf.thankyou") {
				// If the "thank you" was necessary, then respond with a "you are welcome":
				if (context.expectingThankYou) {
					newExpectingThankyou = false;
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.youarewelcome('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
				}
			} else if (perf2.functor.name == "perf.youarewelcome") {
				// Do nothing
			} else if (perf2.functor.name == "perf.q.howareyou") {
				this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.answer('"+context.speaker+"'[#id],'fine'[symbol]))", this.o), speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.ack.ok") {
				// Do nothing
			} else if (perf2.functor.name == "perf.ack.contradict") {
				console.error("RuleBasedAI.reactToPerformative: not sure how to react to " + perf2);
			} else if (perf2.functor.name == "perf.inform") {
				var t2:Term = Term.fromString("action.memorize('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				t2.addAttribute(perf2.attributes[1]);
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.inform.answer") {
				// Do nothing
			} else if (perf2.functor.name == "perf.q.predicate") {
				var t2:Term = Term.fromString("action.answer.predicate('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				t2.addAttribute(perf2.attributes[1]);
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.predicate-negated") {
				var t2:Term = Term.fromString("action.answer.predicate-negated('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				t2.addAttribute(perf2.attributes[1]);
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.whereis") {
				var t2:Term = Term.fromString("action.answer.whereis('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				for(let i:number = 1;i<perf2.attributes.length;i++) {
					t2.addAttribute(perf2.attributes[i]);
				}
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.whereto") {
				var t2:Term = Term.fromString("action.answer.whereto('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				for(let i:number = 1;i<perf2.attributes.length;i++) {
					t2.addAttribute(perf2.attributes[i]);
				}
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.whois.name") {
				var t2:Term = Term.fromString("action.answer.whois.name('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				for(let i:number = 1;i<perf2.attributes.length;i++) {
					t2.addAttribute(perf2.attributes[i]);
				}
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.whois.noname") {
				var t2:Term = Term.fromString("action.answer.whois.noname('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				for(let i:number = 1;i<perf2.attributes.length;i++) {
					t2.addAttribute(perf2.attributes[i]);
				}
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.whatis.name") {
				var t2:Term = Term.fromString("action.answer.whatis.name('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				t2.addAttribute(perf2.attributes[1]);
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.whatis.noname") {
				var t2:Term = Term.fromString("action.answer.whatis.noname('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				t2.addAttribute(perf2.attributes[1]);
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.query") {
				var t2:Term = Term.fromString("action.answer.query('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
//				(<TermTermAttribute>t2.attributes[0]).term.addAttribute(perf2.attributes[1]);
//				(<TermTermAttribute>t2.attributes[0]).term.addAttribute(perf2.attributes[2]);
				t2.addAttribute(new TermTermAttribute(perf2));
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.query-followup") {
				var t2:Term = Term.fromString("action.answer.query-followup('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				t2.addAttribute(perf2.attributes[1]);
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.howmany") {
				var t2:Term = Term.fromString("action.answer.howmany('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
//				(<TermTermAttribute>t2.attributes[0]).term.addAttribute(perf2.attributes[1]);
//				(<TermTermAttribute>t2.attributes[0]).term.addAttribute(perf2.attributes[2]);
				t2.addAttribute(new TermTermAttribute(perf2));
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.when") {
				var t2:Term = Term.fromString("action.answer.when('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				for(let i:number = 1;i<perf2.attributes.length;i++) {
					t2.addAttribute(perf2.attributes[i]);
				}
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.why") {
				var t2:Term = Term.fromString("action.answer.why('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				for(let i:number = 1;i<perf2.attributes.length;i++) {
					t2.addAttribute(perf2.attributes[i]);
				}
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.q.how") {
				var t2:Term = Term.fromString("action.answer.how('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
				for(let i:number = 1;i<perf2.attributes.length;i++) {
					t2.addAttribute(perf2.attributes[i]);
				}
				this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
			} else if (perf2.functor.name == "perf.request.action" || 
					   perf2.functor.name == "perf.q.action") {
				if (perf2.attributes[1] instanceof TermTermAttribute) {
					let action:Term = (<TermTermAttribute>(perf2.attributes[1])).term;
					if (perf2.attributes.length>=3 &&
						perf2.attributes[2] instanceof TermTermAttribute) {
						// this means that the action request has a variable and we need to start an inference process:
						let intention_l:Term[] = NLParser.termsInList((<TermTermAttribute>perf2.attributes[2]).term, "#and");;
						let target1Terms:Term[] = [];
						let target1Signs:boolean[] = [];
						for(let i:number = 0;i<intention_l.length;i++) {
							if (intention_l[i].functor.name == "#not") {
								target1Terms.push((<TermTermAttribute>(intention_l[i].attributes[0])).term);
								target1Signs.push(true);
							} else {
								target1Terms.push(intention_l[i]);
								target1Signs.push(false);
							}
						}

						// 2) start the inference process:
						let target1:Sentence[] = [];
						target1.push(new Sentence(target1Terms, target1Signs));
						let ir:InferenceRecord = new InferenceRecord(this, [], [target1], 1, 0, false, null, new ExecuteAction_InferenceEffect(action), this.o);
						ir.triggeredBy = perf2;
						ir.triggeredBySpeaker = context.speaker;
						this.inferenceProcesses.push(ir);
					} else {
						if (this.canSatisfyActionRequest(action)) {
							this.intentions.push(new IntentionRecord(action, new ConstantTermAttribute(context.speaker, this.cache_sort_id), context.getNLContextPerformative(perf2), null, this.time_in_seconds));
						} else {
							var tmp:string = "action.talk('"+this.selfID+"'[#id], perf.ack.denyrequest('"+context.speaker+"'[#id]))";
							var term:Term = Term.fromString(tmp, this.o);
							this.intentions.push(new IntentionRecord(term, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
						}
					}
				} else {
					var tmp:string = "action.talk('"+this.selfID+"'[#id], perf.ack.denyrequest('"+context.speaker+"'[#id]))";
					var term:Term = Term.fromString(tmp, this.o);
					this.intentions.push(new IntentionRecord(term, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
				}
			} else if (perf2.functor.name == "perf.moreresults") {
				if (context.lastEnumeratedQuestion_answered != null) {
					if (context.lastEnumeratedQuestion_next_answer_index < context.lastEnumeratedQuestion_answers.length) {
						var resultsTA:TermAttribute = null;
						if (context.lastEnumeratedQuestion_answers.length > 
							context.lastEnumeratedQuestion_next_answer_index + MAXIMUM_ANSWERS_TO_GIVE_AT_ONCE_FOR_A_QUERY) {
							resultsTA = new ConstantTermAttribute("etcetera",this.o.getSort("etcetera"));
							for(let i:number = 0;i<MAXIMUM_ANSWERS_TO_GIVE_AT_ONCE_FOR_A_QUERY;i++) {
								resultsTA = new TermTermAttribute(new Term(this.o.getSort("#and"),[context.lastEnumeratedQuestion_answers[context.lastEnumeratedQuestion_next_answer_index], resultsTA]));
								context.lastEnumeratedQuestion_next_answer_index++;
							}
						} else {
							for(;context.lastEnumeratedQuestion_next_answer_index<context.lastEnumeratedQuestion_answers.length ; context.lastEnumeratedQuestion_next_answer_index++) {
								if (resultsTA == null) {
									resultsTA = context.lastEnumeratedQuestion_answers[context.lastEnumeratedQuestion_next_answer_index];
								} else {
									resultsTA = new TermTermAttribute(new Term(this.o.getSort("#and"),[context.lastEnumeratedQuestion_answers[context.lastEnumeratedQuestion_next_answer_index], resultsTA]));
								}
							}
						}
						var term:Term = Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.answer('"+context.speaker+"'[#id],"+resultsTA+"))", this.o);
						// give more answers:
						this.intentions.push(new IntentionRecord(term, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
//						context.lastEnumeratedQuestion_next_answer_index++;
						newExpectingThankyou = true;
					} else {
						// no more answers to be given:
						var term:Term = Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform.answer('"+context.speaker+"'[#id],'no-matches-found'[symbol]))", this.o);
						this.intentions.push(new IntentionRecord(term, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
						newExpectingThankyou = true;
					}
				} else {
					// we don't understand this question:
					var term:Term = Term.fromString("action.talk('"+this.selfID+"'[#id], perf.inform('"+context.speaker+"'[#id],#not(verb.understand('"+this.selfID+"'[#id]))))", this.o);
					this.intentions.push(new IntentionRecord(term, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));
				}

			} else if (perf2.functor.name == "perf.ack.denyrequest") {
				var term:Term = Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.ok('"+context.speaker+"'[#id]))", this.o);
				this.intentions.push(new IntentionRecord(term, speaker, context.getNLContextPerformative(perf2), null, this.time_in_seconds));

			} else {
				console.error("RuleBasedAI.reactToPerformative: unknown performative " + perf2);
			}
		}

		// update conversation state:
		context.expectingThankYou = newExpectingThankyou;
		context.expectingYouAreWelcome = false;
		context.expectingGreet = false;
		context.expectingFarewell = false;		

		return reaction;
	}


	canSatisfyActionRequest(actionRequest:Term) : boolean
	{
		var functor:Sort = actionRequest.functor;
		if (functor.name == "#and") {
			let actionRequest_l:Term[] = NLParser.termsInList(actionRequest, "#and");
			actionRequest = actionRequest_l[0];
		}

		for(let ih of this.intentionHandlers) {
			if (ih.canHandle(actionRequest, this)) return true;
		}
		return false;
	}


	reactToAnswerPerformative(perf:Term, speaker:TermAttribute, context:NLContext) : Term[]
	{
		var reaction:Term[] = [];
		var lastQuestion:NLContextPerformative = context.expectingAnswerToQuestion_stack[context.expectingAnswerToQuestion_stack.length-1];
		console.log("Checking if " + perf + " is a proper answer to " + lastQuestion.performative);

		if (lastQuestion.performative.functor.is_a(this.o.getSort("perf.q.predicate"))) {
			// perf.inform.answer(LISTENER, 'yes'[#id])
			if ((perf.functor.is_a(this.o.getSort("perf.inform")) && perf.attributes.length == 2)) {
				if ((perf.attributes[1] instanceof ConstantTermAttribute)) {
					if ((<ConstantTermAttribute>(perf.attributes[1])).value == "yes") {
						var toMemorize:Term[] = this.sentenceToMemorizeFromPredicateQuestion(lastQuestion.performative, true);
						if (toMemorize == null) {
							// not a proper answer to the question
							this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.invalidanswer('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
							context.popLastQuestion();	// remove the question, since we will ask it again
							this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], "+lastQuestion.performative+")", this.o), speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
							return reaction;
						} else {
							for(let t of toMemorize) {
								var t2:Term = Term.fromString("action.memorize('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
								t2.addAttribute(new TermTermAttribute(t));
								this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
							}
							context.popLastQuestion();	// remove the question, it's been answered
							return reaction;
						}
					} else if ((<ConstantTermAttribute>(perf.attributes[1])).value == "no") {
						var toMemorize:Term[] = this.sentenceToMemorizeFromPredicateQuestion(lastQuestion.performative, false);
						if (toMemorize == null) {
							this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.invalidanswer('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
							context.popLastQuestion();	// remove the question, since we will ask it again
							this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], "+lastQuestion.performative+")", this.o), speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
							return reaction;
						} else {
							for(let t of toMemorize) {
								var t2:Term = Term.fromString("action.memorize('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
								t2.addAttribute(new TermTermAttribute(t));
								this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
							}							
							context.popLastQuestion();	// remove the question, it's been answered
							return reaction;
						}
					} else if ((<ConstantTermAttribute>(perf.attributes[1])).value == "unknown") {
						// nothing to do
						context.popLastQuestion();	// remove the question, it's been answered
						return [];
					} else {
						console.error("unsuported answer to perf.q.predicate " + perf);
						return null;
					}
				} else {
					var toMemorize:Term[] = this.sentenceToMemorizeFromPredicateQuestionWithInformAnswer(lastQuestion.performative, perf);
					if (toMemorize == null) {
						this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.invalidanswer('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
						context.popLastQuestion();	// remove the question, since we will ask it again
						this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], "+lastQuestion.performative+")", this.o), speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
						return reaction;
					} else {
						for(let t of toMemorize) {
							var t2:Term = Term.fromString("action.memorize('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
							t2.addAttribute(new TermTermAttribute(t));
							this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
						}
						context.popLastQuestion();	// remove the question, it's been answered
						return reaction;
					}
				}
			} else {
				console.error("unsuported answer to perf.q.predicate " + perf);
				return null;
			}

		} else if (lastQuestion.performative.functor.is_a(this.o.getSort("perf.q.query"))) {
			if (perf.functor.is_a(this.o.getSort("perf.inform"))) {
				var toMemorize:Term[] = this.sentenceToMemorizeFromQueryQuestion(lastQuestion.performative, perf);
				console.log("toMemorize: " + toMemorize);
				if (toMemorize == null) {
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], perf.ack.invalidanswer('"+context.speaker+"'[#id]))", this.o), speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
					context.popLastQuestion();	// remove the question, since we will ask it again
					this.intentions.push(new IntentionRecord(Term.fromString("action.talk('"+this.selfID+"'[#id], "+lastQuestion.performative+")", this.o), speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
					return reaction;
				} else {
					for(let t of toMemorize) {
						var t2:Term = Term.fromString("action.memorize('"+this.selfID+"'[#id], '"+context.speaker+"'[#id])", this.o);
						t2.addAttribute(new TermTermAttribute(t));
						this.intentions.push(new IntentionRecord(t2, speaker, context.getNLContextPerformative(perf), null, this.time_in_seconds));
					}
					context.popLastQuestion();	// remove the question, it's been answered
					return reaction;
				}
			} else {
				console.error("unsuported answer to perf.q.query " + perf);
				return null;
			}

		} else if (lastQuestion.performative.functor.is_a(this.o.getSort("perf.q.action"))) {
			if ((perf.functor.is_a(this.o.getSort("perf.inform")) && perf.attributes.length == 2) ||
				(perf.functor.is_a(this.o.getSort("perf.inform.answer")) && perf.attributes.length == 3)) {

				if (perf.attributes.length == 3) {
					var answerPredicate:TermAttribute = perf.attributes[2];
					var questionPredicate:TermAttribute = lastQuestion.performative.attributes[1];

					console.log("  - answerPredicate: " + answerPredicate);
					console.log("  - questionPredicate: " + questionPredicate);

					if (!(answerPredicate instanceof TermTermAttribute) ||
						!(questionPredicate instanceof TermTermAttribute)) {
						console.log("predicates are not terms!!");
						return null;
					}

					var ap_term:Term = (<TermTermAttribute>answerPredicate).term;
					var qp_term:Term = (<TermTermAttribute>questionPredicate).term;
					if (ap_term.equalsNoBindings(qp_term) != 1) {
						console.log("predicates do not match!!");
						return null;
					}
				}

				if ((perf.attributes[1] instanceof ConstantTermAttribute)) {
					if ((<ConstantTermAttribute>(perf.attributes[1])).value == "yes") {
						// ...
						context.popLastQuestion();	// remove the question, it's been answered
						return [];
					} else if ((<ConstantTermAttribute>(perf.attributes[1])).value == "no") {
						// ...
						context.popLastQuestion();	// remove the question, it's been answered
						return [];
					} else if ((<ConstantTermAttribute>(perf.attributes[1])).value == "unknown") {
						// ...
						context.popLastQuestion();	// remove the question, it's been answered
						return [];
					} else {
						console.error("unsuported answer to perf.q.action " + perf);
						return null;
					}
				} else {
					console.error("unsuported answer to perf.q.action " + perf);
					return null;
				}
			} else if (perf.functor.is_a(this.o.getSort("perf.ack.ok"))) {
				// ...
				context.popLastQuestion();	// remove the question, it's been answered
				return [];
			} else {
				console.error("unsuported answer to perf.q.action " + perf);
				return null;
			}

		} else {
			console.error("answers to questions of type " + lastQuestion.performative.functor + " not yet supported...");
			return null;
		}
	}


	sentenceToMemorizeFromPredicateQuestion(predicateQuestion:Term, answer:boolean) : Term[]
	{
//		console.log("sentenceToMemorizeFromPredicateQuestion.predicateQuestion: " + predicateQuestion);
//		console.log("sentenceToMemorizeFromPredicateQuestion.answer: " + answer);
		if (!(predicateQuestion.attributes[1] instanceof TermTermAttribute)) return [];
		var queryTerm:Term = (<TermTermAttribute>(predicateQuestion.attributes[1])).term;
		// if there are variables, that means there was a query involved, so, we don't know how to do it:
		if (queryTerm.getAllVariables().length != 0) return [];

		var queryTerms:TermAttribute[] = NLParser.elementsInList(queryTerm,"#and");

		if (answer) {
			// we need to memorize each term:
			var toMemorize_l:Term[] = [];
			for(let qt of queryTerms) {
				if (qt instanceof TermTermAttribute) {
					toMemorize_l.push((<TermTermAttribute>qt).term);
				}
			}
			return toMemorize_l;
		} else {
			// one of them is wrong!
			var toMemorize:Term = new Term(this.o.getSort("#not"), [queryTerms[0]]);
			for(let i:number = 1;i<queryTerms.length;i++) {
				toMemorize = new Term(this.o.getSort("#and"), 
										[new TermTermAttribute(toMemorize),
										 new TermTermAttribute(new Term(this.o.getSort("#not"), 
										 								[queryTerms[i]]))]);
			}
			return [toMemorize];
		}

		return [];
	}


	sentenceToMemorizeFromPredicateQuestionWithInformAnswer(predicateQuestion:Term, answerPerformative:Term) : Term[]
	{
		var answerTerm:TermAttribute = answerPerformative.attributes[1];
		if ((answerTerm instanceof TermTermAttribute) &&
			(<TermTermAttribute>answerTerm).term.functor.name == "proper-noun") {
			answerTerm = (<TermTermAttribute>answerTerm).term.attributes[0];
		}

		if (!(predicateQuestion.attributes[1] instanceof TermTermAttribute)) return [];
		var queryTerm:TermAttribute = predicateQuestion.attributes[1];
		var queryTerms:TermAttribute[] = NLParser.elementsInList((<TermTermAttribute>queryTerm).term,"#and");	
		if (!(queryTerms[0] instanceof TermTermAttribute)) return [];
		var mainQueryTerm:Term = (<TermTermAttribute>(queryTerms[0])).term;
		if (mainQueryTerm.functor.name == "verb.remember" ||
			mainQueryTerm.functor.name == "verb.know") {
			// in this case, it's basically a query in disguise:
//			console.error("sentenceToMemorizeFromPredicateQuestionWithInformAnswer: predicateQuestion = " + predicateQuestion);
//			console.error("sentenceToMemorizeFromPredicateQuestionWithInformAnswer: answerPerformative = " + answerPerformative);

			// replace the query term by the hidden one inside:
			if (!(mainQueryTerm.attributes[1] instanceof TermTermAttribute)) return null;
			queryTerm = mainQueryTerm.attributes[1];
			queryTerms = NLParser.elementsInList((<TermTermAttribute>queryTerm).term,"#and");
			if (!(queryTerms[0] instanceof TermTermAttribute)) return null;
			if (!(queryTerms[1] instanceof TermTermAttribute)) return null;
			if (queryTerms.length != 2) return null;
			var queryVariable:TermAttribute = queryTerms[0];
			if (!(queryVariable instanceof TermTermAttribute) ||
				(<TermTermAttribute>queryVariable).term.functor.name != "#query") return null;
			queryVariable = (<TermTermAttribute>queryVariable).term.attributes[0];
			queryTerm = queryTerms[1];

			if (answerTerm instanceof VariableTermAttribute) {
				if (answerTerm.sort.name == "unknown") return [];
				return null;
			} else if (answerTerm instanceof ConstantTermAttribute) {
				// direct answer:
//				console.log("sentenceToMemorizeFromPredicateQuestionWithInformAnswer: direct answer!");
//				console.log("sentenceToMemorizeFromPredicateQuestionWithInformAnswer: unify term 1: " + queryVariable);
//				console.log("sentenceToMemorizeFromPredicateQuestionWithInformAnswer: unify term 2: " + answerTerm);
				var bindings2:Bindings = new Bindings();
				if (Term.unifyAttribute(queryVariable, answerTerm, true, bindings2)) {
					var tmp:TermAttribute = queryTerm.applyBindings(bindings2);
					if (!(tmp instanceof TermTermAttribute)) return null;
					return [(<TermTermAttribute>tmp).term];
				}
				return null;
			} else {
				// indirect answer:
//				console.log("sentenceToMemorizeFromPredicateQuestionWithInformAnswer: indirect answer!");
//				console.log("sentenceToMemorizeFromPredicateQuestionWithInformAnswer: unify term 1: " + queryTerm);
//				console.log("sentenceToMemorizeFromPredicateQuestionWithInformAnswer: unify term 2: " + answerTerm);
				var bindings2:Bindings = new Bindings();
				if (Term.unifyAttribute(queryTerm, answerTerm, true, bindings2)) {
					var tmp:TermAttribute = queryTerm.applyBindings(bindings2);
					if (!(tmp instanceof TermTermAttribute)) return null;
					return [(<TermTermAttribute>tmp).term];
				}
				return null;
			}
		} else {
			return null;
		}
	}


	sentenceToMemorizeFromQueryQuestion(queryPerformative:Term, answerPerformative:Term) : Term[]
	{
		var queryVariable:TermAttribute = queryPerformative.attributes[1];
		var queryTerm:TermAttribute = queryPerformative.attributes[2];
		var answerTerm:TermAttribute = answerPerformative.attributes[1];

		if ((answerTerm instanceof TermTermAttribute) &&
			(<TermTermAttribute>answerTerm).term.functor.name == "proper-noun") {
			answerTerm = (<TermTermAttribute>answerTerm).term.attributes[0];
		}

		if (answerTerm instanceof VariableTermAttribute) {
			if (answerTerm.sort.name == "unknown") return [];
			return null;
		} else if (answerTerm instanceof ConstantTermAttribute) {
			// direct answer:
//			console.log("sentenceToMemorizeFromQueryQuestion: direct answer!");
//			console.log("sentenceToMemorizeFromQueryQuestion: unify term 1: " + queryVariable);
//			console.log("sentenceToMemorizeFromQueryQuestion: unify term 2: " + answerTerm);
			var bindings2:Bindings = new Bindings();
			if (Term.unifyAttribute(queryVariable, answerTerm, true, bindings2)) {
				var tmp:TermAttribute = queryTerm.applyBindings(bindings2);
				if (!(tmp instanceof TermTermAttribute)) return null;
				return [(<TermTermAttribute>tmp).term];
			}
			return null;
		} else {
			// indirect answer:
//			console.log("sentenceToMemorizeFromQueryQuestion: indirect answer!");
//			console.log("sentenceToMemorizeFromQueryQuestion: unify term 1: " + queryTerm);
//			console.log("sentenceToMemorizeFromQueryQuestion: unify term 2: " + answerTerm);
			var bindings2:Bindings = new Bindings();
			if (Term.unifyAttribute(queryTerm, answerTerm, true, bindings2)) {
				var tmp:TermAttribute = queryTerm.applyBindings(bindings2);
				if (!(tmp instanceof TermTermAttribute)) return null;
				return [(<TermTermAttribute>tmp).term];
			}
			return null;
		}
	}


	talkingToUs(context:NLContext, speaker:string, performative:Term) : boolean
	{
		// the "targetList" is a structure of the form #and(T1, #and(t2, ... #and(Tn-1,Tn)...) if there is more than one target
		var targetList:TermAttribute = null;
		var targetIDList:string[] = [];
		if (performative != null) {
			targetList = performative.attributes[0];
			while(targetList instanceof TermTermAttribute) {
				if (targetList.term.functor.name == "#and" &&
					targetList.term.attributes[0] instanceof ConstantTermAttribute) {
					targetIDList.push((<ConstantTermAttribute>targetList.term.attributes[0]).value);
					targetList = targetList.term.attributes[1];
				}
			}
			if (targetList instanceof ConstantTermAttribute) targetIDList.push((<ConstantTermAttribute>targetList).value);

			for(let targetID of targetIDList) {
				if (targetID == this.selfID) {
					context.lastPerformativeInvolvingThisCharacterWasToUs = true;
					return true;
				} else {
					// talking to someone else, so we are now not talking to that someone else:
					var context2:NLContext = this.contextForSpeakerWithoutCreatingANewOne(targetID);
					if (context2 != null) {
						context2.lastPerformativeInvolvingThisCharacterWasToUs = false;
						context2.inConversation = false;
					}
				}
			}

			if (targetIDList.length > 0) {
				// not talking to us!
				context.lastPerformativeInvolvingThisCharacterWasToUs = false;
				context.inConversation = false;
				for(let targetID of targetIDList) {
					var context2:NLContext = this.contextForSpeakerWithoutCreatingANewOne(targetID);
					if (context2 != null) {
						context2.inConversation = false;
						context2.lastPerformativeInvolvingThisCharacterWasToUs = false;
					}
				}
				return false;
			}
		}

		if (context.performatives.length>0 &&
			(this.time_in_seconds - context.performatives[0].timeStamp) >= CONVERSATION_TIMEOUT) return false;
		if (context.lastPerformativeInvolvingThisCharacterWasToUs) return true;
		if (context.inConversation) return true;

		return false;
	}


	inferenceUpdate()
	{
//	    DEBUG_resolution = true;

		// select which inference process to continue in this cycle:
		// pick the inference that generates the maximum anxiety:
		var max_anxiety_inference:InferenceRecord = null;
		for(let i:number = 0;i<this.inferenceProcesses.length;i++) {
			// increment anxiety of inferences:
			this.inferenceProcesses[i].anxiety += this.inferenceProcesses[i].priority;

			if (max_anxiety_inference == null ||
				this.inferenceProcesses[i].anxiety > max_anxiety_inference.anxiety) {
				max_anxiety_inference = this.inferenceProcesses[i];
			}
		}

		if (max_anxiety_inference != null) {
			var idx:number = max_anxiety_inference.completedInferences.length;
			if (idx >= max_anxiety_inference.inferences.length) {
				// inference is over!
				this.inferenceProcesses.splice(this.inferenceProcesses.indexOf(max_anxiety_inference),1);
				if (max_anxiety_inference.effect != null) {
					max_anxiety_inference.effect.execute(max_anxiety_inference, this);
				}

				// after we have answered everything the player wanted, check to see if we had any questions in the stack:
				if (this.inferenceProcesses.length == 0) {
					for(let context of this.contexts) {
						if (context.expectingAnswerToQuestionTimeStamp_stack.length > 0) {
							var idx:number = context.expectingAnswerToQuestionTimeStamp_stack.length - 1;
							if (this.time_in_seconds - context.expectingAnswerToQuestionTimeStamp_stack[idx] > this.questionPatienceTimmer) {
								// We have waited for an answer too long, ask the question again:
								if (this.canSee(context.speaker)) this.reaskTheLastQuestion(context);
							}
						}
					}
				}

			} else {
				if (max_anxiety_inference.findAllAnswers) {
					if (max_anxiety_inference.inferences[idx].stepAccumulatingResults()) {
						max_anxiety_inference.completedInferences.push(max_anxiety_inference.inferences[idx]);
					}
				} else {
					if (max_anxiety_inference.inferences[idx].step()) {
						max_anxiety_inference.completedInferences.push(max_anxiety_inference.inferences[idx]);
					}
				}
			}
		}
	}


	contextForSpeaker(speaker:string) : NLContext
	{
		if (this.selfID == speaker) console.error("trying to get a context to talk to self!!");

		for(let c of this.contexts) {
			if (c.speaker == speaker) return c;
		}
		var context:NLContext = new NLContext(speaker, this, MENTION_MEMORY_SIZE);
		this.contexts.push(context);
		return context;		
	}


	contextForSpeakerWithoutCreatingANewOne(speaker:string) : NLContext
	{
		for(let c of this.contexts) {
			if (c.speaker == speaker) return c;
		}
		return null;
	}


	executeIntentions()
	{
		if (this.intentions.length == 0 &&
			this.inferenceProcesses.length == 0 &&
			this.queuedIntentions.length > 0) {
			this.intentions = this.queuedIntentions;
			this.queuedIntentions = [];
		}

		var toDelete:IntentionRecord[] = [];
		for(let intention of this.intentions) {
			var ret:boolean = this.executeIntention(intention);

			if (ret == null) {
				// this means that although we can execute the intetion, it cannot be executed right now, so, we need to wait:
				continue;
			}

			if (!ret) console.error("Unsupported intention: " + intention);
			toDelete.push(intention);
		}
		for(let t of toDelete) {
			this.intentions.splice(this.intentions.indexOf(t), 1);
		}
	}


	executeIntention(ir:IntentionRecord) : boolean
	{
		var intention:Term = ir.action;
		for(let ih of this.intentionHandlers) {
			if (ih.canHandle(intention, this)) {
				return ih.execute(ir, this);
			}
		}

		return false;
	}


	queueIntention(intention:Term, requester:TermAttribute, reqperformative:NLContextPerformative)
	{
		this.queuedIntentions.push(new IntentionRecord(intention, requester, reqperformative, null, this.time_in_seconds));
	}


	canSee(characterID:string)
	{
		return true;
	}
	

	conversationUpdate()
	{
		for(let context of this.contexts) {
			if (context.expectingAnswerToQuestionTimeStamp_stack.length > 0) {
//				console.log("context.expectingAnswerToQuestion_stack.length: " + context.expectingAnswerToQuestion_stack.length + 
//						    "\ncontext.expectingAnswerToQuestionTimeStamp_stack: " + context.expectingAnswerToQuestionTimeStamp_stack);
				var idx:number = context.expectingAnswerToQuestionTimeStamp_stack.length - 1;
				if (this.time_in_seconds - context.expectingAnswerToQuestionTimeStamp_stack[idx] > this.questionPatienceTimmer) {
					// We have waited for an answer too long, ask the question again:
					if (this.canSee(context.speaker)) this.reaskTheLastQuestion(context);
				}
			}
		}
	}


	reaskTheLastQuestion(context:NLContext)
	{
		var idx:number = context.expectingAnswerToQuestionTimeStamp_stack.length - 1;
		var performative:NLContextPerformative = context.expectingAnswerToQuestion_stack[idx];
//		console.log("context.expectingAnswerToQuestionTimeStamp_stack (before): " + context.expectingAnswerToQuestionTimeStamp_stack);
		context.popLastQuestion();
//		console.log("context.expectingAnswerToQuestionTimeStamp_stack (after): " + context.expectingAnswerToQuestionTimeStamp_stack);

		// re-add the intention:
		if (!context.inConversation) {
			// we are not having a conversation at this point, so, we need to restart it:
//			this.etaoinSays("perf.callattention('david'[#id])");		
			var term:Term = Term.fromString("action.talk('"+this.selfID+"'[#id], perf.callattention('"+context.speaker+"'[#id]))",this.o);
			this.intentions.push(new IntentionRecord(term, null, null, null, this.time_in_seconds));
		}

		var term2:Term = new Term(this.o.getSort("action.talk"), 
								 [new ConstantTermAttribute(this.selfID, this.o.getSort("#id")), 
								  new TermTermAttribute(performative.performative)]);
		this.intentions.push(new IntentionRecord(term2, null, null, null, this.time_in_seconds));
	}


	/*
	- checks if "q" unifies with any term in the short or long term memory, and returns the bindings
	*/
	noInferenceQuery(q:Term, o:Ontology) : Bindings
	{
		// short term memory:
		var tmp:[Term, Bindings] = this.shortTermMemory.firstMatch(q);
//		console.log("noInferenceQuery, stm: " + q + " -> " + tmp);
		if (tmp!=null) return tmp[1];

		// long term memory:
		var s:Sentence = this.longTermMemory.firstMatch(q.functor, q.attributes.length, o);
		while(s != null) {
			var b:Bindings = new Bindings();
			if (s.terms.length == 1 && s.sign[0] &&
				q.unify(s.terms[0], true, b)) {
				return b;
			}
			s = this.longTermMemory.nextMatch();
		}

		return null;
	}


	noInferenceQueryValue(q:Term, o:Ontology, variableName:string) : TermAttribute
	{
		var b:Bindings = this.noInferenceQuery(q, o);
//		console.log("noInferenceQueryValue b = " + b);
		if (b == null) return null;
		for(let tmp of b.l) {
			if (tmp[0].name == variableName) return tmp[1];
		}
		return null;
	}


	/*
	sentenceContainsSpatialRelations(s:Sentence) : boolean
	{
		for(let t of s.terms) {
			if (this.termContainsSpatialRelations(t)) return true;
		}
		return false;
	}


	termContainsSpatialRelations(t:Term) : boolean
	{
		if (t.functor.is_a(this.o.getSort("spatial-relation"))) return true;
		for(let att of t.attributes) {
			if (att instanceof TermTermAttribute) {
				if (this.termContainsSpatialRelations((<TermTermAttribute>att).term)) return true;
			}
		}
		return false;
	}
	*/


	checkSpatialRelation(relation:Sort, o1ID:string, o2ID:string, referenceObject:string) : boolean
	{
		return null;
	}


	spatialRelations(o1ID:string, o2ID:string) : Sort[]
	{
		return [];
	}


	recalculateCharacterAges()
	{
		for(let se of this.longTermMemory.plainSentenceList) {
			let s:Sentence = se.sentence;
			if (s.terms.length == 1 && s.sign[0] &&
				s.terms[0].functor.name == "property.born" &&
				s.terms[0].attributes[0] instanceof ConstantTermAttribute) {
				let birthday:number = se.time;
				let bd_year:number = getCurrentYear(birthday);
				let bd_month:number = getCurrentMonth(birthday);
				let bd_day:number = getCurrentDayOfTheMonth(birthday);
				let current_year:number = getCurrentYear(this.time_in_seconds);
				let current_month:number = getCurrentMonth(this.time_in_seconds);
				let current_day:number = getCurrentDayOfTheMonth(this.time_in_seconds);
				let age_in_years:number = current_year - bd_year;
				if (current_month < bd_month ||
					(current_month == bd_month && current_day < bd_day)) age_in_years--;
				this.longTermMemory.addStateSentenceIfNew(new Sentence([Term.fromString("property.age("+s.terms[0].attributes[0]+",'"+age_in_years+"'[time.year])",this.o)],
																	   [true]), 
														  se.provenance, 1, se.time);
			}
		}
	}


	mostSpecificMatchesFromShortOrLongTermMemoryThatCanBeRendered(query:Term) : Term[]
	{
		var mostSpecificTypes:Term[] = [];
		
		for(let match_bindings of this.shortTermMemory.allMatches(query)) {
			var t:Term = match_bindings[0];
			// if we don't know how to render this, then ignore:
			var msType:Sort = this.mostSpecificTypeThatCanBeRendered(t.functor);
			if (msType == null) continue;
			t = t.clone([]);
			t.functor = msType;

			var isMoreSpecific:boolean = true;
			var toDelete:Term[] = [];
			for(let previous of mostSpecificTypes) {
				if (t.functor.subsumes(previous.functor)) {
					isMoreSpecific = false;
				} else if (previous.functor.subsumes(t.functor)) {
					toDelete.push(previous);
				}
			}
			for(let previous of toDelete) {
				mostSpecificTypes.splice(mostSpecificTypes.indexOf(previous),1);
			}
			if (isMoreSpecific) mostSpecificTypes.push(t);
		}

		for(let match of this.longTermMemory.allMatches(query.functor, query.attributes.length, this.o)) {
			if (match.terms.length == 1 && match.sign[0]) {
				var t:Term = match.terms[0];
				if (query.unify(t, true, new Bindings())) {
					// if we don't know how to render this, then ignore:
					var msType:Sort = this.mostSpecificTypeThatCanBeRendered(t.functor);
					if (msType == null) continue;
					t = t.clone([]);
					t.functor = msType;

					var isMoreSpecific:boolean = true;
					var toDelete:Term[] = [];
					for(let previous of mostSpecificTypes) {
						if (t.functor.subsumes(previous.functor)) {
							isMoreSpecific = false;
						} else if (previous.functor.subsumes(t.functor)) {
							toDelete.push(previous);
						}
					}
					for(let previous of toDelete) {
						mostSpecificTypes.splice(mostSpecificTypes.indexOf(previous),1);
					}
					if (isMoreSpecific) mostSpecificTypes.push(t);
				}
			}
		}
		return mostSpecificTypes;
	}


	mostSpecificTypeThatCanBeRendered(typeSort:Sort) 
	{
		var typeString:string = this.naturalLanguageParser.posParser.getTypeString(typeSort, 0);
		if (typeString == null) {
			var typeSort_l:Sort[] = typeSort.getAncestors();
			for(let ts of typeSort_l) {
				typeString = this.naturalLanguageParser.posParser.getTypeString(ts, 0);
				if (typeString != null) {
					typeSort = ts;
					break;
				}
			}
		}
		return typeSort;
	}	


	restoreFromXML(xml:Element)
	{
		this.time_in_seconds = Number(xml.getAttribute("timeInSeconds"));
		this.questionPatienceTimmer = Number(xml.getAttribute("questionPatienceTimmer"));

		var stm_xml = getFirstElementChildrenByTag(xml, "shortTermMemory");
		if (stm_xml != null) {
			this.shortTermMemory = new TermContainer();
			for(let term_xml of getElementChildrenByTag(stm_xml, "term")) {
				var a:number = Number(term_xml.getAttribute("activation"));
				var p:string = term_xml.getAttribute("provenance");
				var t:Term = Term.fromString(term_xml.getAttribute("term"), this.o);
				var time:number = Number(term_xml.getAttribute("time"));
				if (a != null && t != null) this.shortTermMemory.addTerm(t, p, a, time);
			}
			for(let term_xml of getElementChildrenByTag(stm_xml, "previousTerm")) {
				var a:number = Number(term_xml.getAttribute("activation"));
				var p:string = term_xml.getAttribute("provenance");
				var t:Term = Term.fromString(term_xml.getAttribute("term"), this.o);
				var time:number = Number(term_xml.getAttribute("time"));
				if (a != null && t != null) this.shortTermMemory.plainPreviousTermList.push(new TermEntry(t, p, a, time));
			}
		}

		var ltm_xml = getFirstElementChildrenByTag(xml, "longTermMemory");
		if (ltm_xml != null) {
//			this.longTermMemory = new SentenceContainer();
			this.loadLongTermRulesFromXML(ltm_xml);
		}

		// context:
		var context_xmls:Element[] = getElementChildrenByTag(xml, "context");
		for(let context_xml of context_xmls) {
			this.contexts.push(NLContext.fromXML(context_xml, this.o, this, MENTION_MEMORY_SIZE));
		}

		// intentions:
		this.intentions = [];
		for(let intention_xml of getElementChildrenByTag(xml, "IntentionRecord")) {
			let intention:IntentionRecord = IntentionRecord.fromXML(intention_xml, this, this.o);
			this.intentions.push(intention);
		}
		this.queuedIntentions = [];
		let queuedIntentions_xml:Element = getFirstElementChildrenByTag(xml, "queuedIntentions");
		if (queuedIntentions_xml != null) {
			for(let intention_xml of getElementChildrenByTag(queuedIntentions_xml, "IntentionRecord")) {
				let intention:IntentionRecord = IntentionRecord.fromXML(intention_xml, this, this.o);
				this.queuedIntentions.push(intention);
			}
		}
		this.intentionsCausedByRequest = [];
		let intentionsCausedByRequest_xml:Element = getFirstElementChildrenByTag(xml, "intentionsCausedByRequest");
		if (intentionsCausedByRequest_xml != null) {
			for(let intention_xml of getElementChildrenByTag(intentionsCausedByRequest_xml, "IntentionRecord")) {
				let intention:IntentionRecord = IntentionRecord.fromXML(intention_xml, this, this.o);
				this.intentionsCausedByRequest.push(intention);
			}
		}

		// inference:
		let inference_xml:Element = getFirstElementChildrenByTag(xml, "inference");
		if (inference_xml != null) {
			this.inferenceProcesses = [];
			for(let ir_xml of getElementChildrenByTag(inference_xml, "InferenceRecord")) {
				var ir:InferenceRecord = InferenceRecord.fromXML(ir_xml, this.o, this);
				if (ir != null) this.inferenceProcesses.push(ir);
			}
		}
	}


	saveToXML() : string
	{
		var str:string = "<RuleBasedAI timeInSeconds=\""+this.time_in_seconds+"\" "+
									  "questionPatienceTimmer=\""+this.questionPatienceTimmer+"\">\n";

		str += "<shortTermMemory>\n";
		for(let te of this.shortTermMemory.plainTermList) {
			str += "<term activation=\""+te.activation+"\" " + 
						 "provenance=\""+te.provenance+"\" " +
						 "term=\""+te.term.toStringXML()+"\" " +
						 "time=\""+te.time+"\"/>\n";
		}
		for(let te of this.shortTermMemory.plainPreviousTermList) {
			str += "<previousTerm activation=\""+te.activation+"\" " + 
						 "provenance=\""+te.provenance+"\" " +
						 "term=\""+te.term.toStringXML()+"\" " +
						 "time=\""+te.time+"\"/>\n";
		}
		str += "</shortTermMemory>\n";

		str += "<longTermMemory>\n";
		for(let se of this.longTermMemory.plainPreviousSentenceList) {
			if (se.provenance != BACKGROUND_PROVENANCE) {
				str += "<sentence activation=\""+se.activation+"\" " +
					   "provenance=\""+se.provenance+"\" " +
					   "sentence=\""+se.sentence.toStringXML()+"\" "+
					   "time=\""+se.time+"\"/>\n";
			}
		}
		for(let se of this.longTermMemory.previousSentencesWithNoCurrentSentence) {
			if (se.provenance != BACKGROUND_PROVENANCE) {
				str += "<sentence activation=\""+se.activation+"\" " +
					   "provenance=\""+se.provenance+"\" " +
					   "sentence=\""+se.sentence.toStringXML()+"\" "+
					   "time=\""+se.time+"\" "+
					   "timeEnd=\""+se.timeEnd+"\"/>\n";
			}
		}
		for(let se of this.longTermMemory.plainSentenceList) {
			if (se.provenance != BACKGROUND_PROVENANCE) {
				str += "<sentence activation=\""+se.activation+"\" " +
					   "provenance=\""+se.provenance+"\" " +
					   "sentence=\""+se.sentence.toStringXML()+"\" "+
					   "time=\""+se.time+"\"/>\n";
			}
		}
		str += "</longTermMemory>\n";

		for(let t of this.intentions) {
			str += t.saveToXML(this);
		}
		if (this.queuedIntentions.length > 0) {
			str += "<queuedIntentions>\n";
			for(let t of this.queuedIntentions) {
				str += t.saveToXML(this);
			}
			str += "</queuedIntentions>\n";
		}
		if (this.intentionsCausedByRequest.length > 0) {
			str += "<intentionsCausedByRequest>\n";
			for(let t of this.intentionsCausedByRequest) {
				str += t.saveToXML(this);
			}
			str += "</intentionsCausedByRequest>\n";
		}

		str += "<inference>\n";
		for(let ip of this.inferenceProcesses) {
			str += ip.saveToXML(this) + "\n";
		}
		str += "</inference>\n";

		for(let context of this.contexts) {
			str += context.saveToXML()  + "\n";
		}

        str += this.savePropertiesToXML() + "\n";

		
		str += "</RuleBasedAI>";

		return str;
	}


	// this function is the one that will be extended by the subclasses to add additional info
	savePropertiesToXML() : string
	{
		return "";
	}


	time_in_seconds:number = 0;
	questionPatienceTimmer:number = 1200;

	o:Ontology = null;
	naturalLanguageParser:NLParser = null;
	perceptionFrequency:number = 10;
	perceptionFrequencyOffset:number = 0;
	perceptionMemoryTime:number = 120;

    selfID:string = "self";
	perceptionBuffer:Term[] = [];
	shortTermMemory:TermContainer = new TermContainer();
	longTermMemory:SentenceContainer = new SentenceContainer();

	intentionHandlers:IntentionAction[] = [];

	intentions:IntentionRecord[] = [];	// [intention, requester] (in case the action in the intention was requested by some other character)
	queuedIntentions:IntentionRecord[] = [];	// these will become intentions only when intentions == [] and inferenceProcesses == []
									// the use of this is to queue things to do after the AI has finished doing the current set of things
	intentionsCausedByRequest:IntentionRecord[] = [];	// we store the intention records for which there is a cause, for answering later "why" questions

	inferenceProcesses:InferenceRecord[] = [];	// list of the current inferences the AI is trying to perform


	contexts:NLContext[] = [];	// contexts for natural language processing (one per entity we speak to)

	// Sort cache for perception:
	cache_sort_name:Sort = null;
	cache_sort_space_at:Sort = null;
	cache_sort_time_current:Sort = null;
	cache_sort_number:Sort = null;
	cache_sort_symbol:Sort = null;
	cache_sort_id:Sort = null;
	cache_sort_map:Sort = null;
	cache_sort_intention:Sort = null;
	cache_sort_action_talk:Sort = null;
	cache_sort_performative:Sort = null;
	cache_sort_property:Sort = null;
	cache_sort_property_with_value:Sort = null;
	cache_sort_relation_with_value:Sort = null;
	cache_sort_object:Sort = null;
	cache_sort_space_location:Sort = null;
	cache_sort_relation:Sort = null;
	cache_sort_verb_have:Sort = null;
	cache_sort_verb_contains:Sort = null;
	cache_sort_stateSort:Sort = null;
	cache_sort_action_follow:Sort = null;
}