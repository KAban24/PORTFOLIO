(function () {
  "use strict";

  var root = document.documentElement;
  var body = document.body;
  if (!body || body.getAttribute("data-page") !== "reviews") return;

  var form = document.querySelector("[data-review-form]");
  if (!form) return;

  var translations = window.I18N || {};
  var supported = ["ru", "en", "uk"];
  var storageKey = "kaban-reviews";
  var apiUrl = "/api/reviews";
  var storageLimit = 50;
  var minDescription = 10;
  var minReply = 2;

  var nameInput = form.querySelector("#reviewName");
  var emailInput = form.querySelector("#reviewEmail");
  var descriptionInput = form.querySelector("#reviewDescription");
  var prosInput = form.querySelector("#reviewPros");
  var consInput = form.querySelector("#reviewCons");
  var websiteInput = form.querySelector("#reviewWebsite");
  var ratingValue = form.querySelector("[data-rating-value]");
  var ratingLabel = form.querySelector("[data-rating-label]");
  var ratingReset = form.querySelector("[data-rating-reset]");
  var starButtons = Array.prototype.slice.call(form.querySelectorAll("[data-star]"));
  var submitButton = form.querySelector("[data-review-submit]");
  var submitLabel = submitButton ? submitButton.querySelector("span[data-i18n]") : null;
  var statusNode = form.querySelector("[data-review-status]");
  var noteNode = document.querySelector("[data-review-note]");
  var listNode = document.querySelector("[data-review-list]");
  var emptyNode = document.querySelector("[data-review-empty]");
  var averageNode = document.querySelector("[data-review-average]");
  var countNode = document.querySelector("[data-review-count]");
  var summaryStars = document.querySelector("[data-review-stars]");

  var state = {
    reviews: [],
    mode: "loading",
    rating: 0,
    busy: false,
    statusKey: "",
    statusError: false
  };

  function getLang() {
    var lang = root.lang;
    return supported.indexOf(lang) === -1 ? "ru" : lang;
  }

  function t(key, vars) {
    var lang = getLang();
    var dictionary = translations[lang] || translations.ru || {};
    var fallback = translations.ru || {};
    var text = dictionary[key] || fallback[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.replace("{" + name + "}", String(vars[name]));
      });
    }
    return text;
  }

  function createId() {
    return "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function cleanText(value, limit) {
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
  }

  function isValidEmail(value) {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function normalizeReply(raw) {
    if (!raw || typeof raw !== "object") return null;
    var text = cleanText(raw.text, 600);
    if (!text) return null;
    return {
      id: raw.id ? String(raw.id) : createId(),
      name: cleanText(raw.name, 40),
      text: text,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()
    };
  }

  function normalizeReview(raw) {
    if (!raw || typeof raw !== "object") return null;
    var description = cleanText(raw.description, 1200);
    if (!description) return null;
    var rating = Math.round(Number(raw.rating));
    if (!isFinite(rating)) rating = 0;
    rating = Math.max(0, Math.min(5, rating));
    return {
      id: raw.id ? String(raw.id) : createId(),
      name: cleanText(raw.name, 60),
      rating: rating,
      description: description,
      pros: cleanText(raw.pros, 400),
      cons: cleanText(raw.cons, 400),
      replies: Array.isArray(raw.replies) ? raw.replies.map(normalizeReply).filter(Boolean) : [],
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()
    };
  }

  function sortReviews(list) {
    return list.slice().sort(function (a, b) {
      var first = new Date(a.createdAt).getTime() || 0;
      var second = new Date(b.createdAt).getTime() || 0;
      return second - first;
    });
  }

  function readLocal() {
    try {
      var parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(parsed)) return [];
      return sortReviews(parsed.map(normalizeReview).filter(Boolean)).slice(0, storageLimit);
    } catch (error) {
      return [];
    }
  }

  function writeLocal(list) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(list.slice(0, storageLimit)));
    } catch (error) {}
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    var locale = getLang() === "uk" ? "uk-UA" : getLang() === "en" ? "en-GB" : "ru-RU";
    try {
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
    } catch (error) {
      return date.toLocaleDateString();
    }
  }

  function appendStars(container, rating, className) {
    if (!container) return;
    container.textContent = "";
    container.className = className;
    for (var index = 1; index <= 5; index += 1) {
      var fill = Math.max(0, Math.min(1, rating - (index - 1))) * 100;
      var star = document.createElement("span");
      star.className = "star" + (fill > 0 ? " is-active" : "");
      star.style.setProperty("--fill", fill.toFixed(1) + "%");
      star.textContent = "★";
      star.setAttribute("aria-hidden", "true");
      container.appendChild(star);
    }
  }

  function renderSummary() {
    var rated = state.reviews.filter(function (review) {
      return review.rating > 0;
    });
    var total = rated.reduce(function (sum, review) {
      return sum + review.rating;
    }, 0);
    var average = rated.length ? total / rated.length : 0;

    if (averageNode) averageNode.textContent = average.toFixed(1);
    if (countNode) countNode.textContent = t("reviews.count", { n: state.reviews.length });
    appendStars(summaryStars, average, "stars reviews-summary__stars");
  }

  function makeElement(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function buildReviewCard(review, index) {
    var card = makeElement("article", "review-card");
    card.setAttribute("data-review-id", review.id);
    var head = makeElement("div", "review-card__head");
    var author = makeElement("div", "review-card__author");
    var displayName = review.name || t("reviews.anonymous");
    var avatar = makeElement("span", "review-avatar", displayName.charAt(0).toUpperCase() || "K");
    var identity = makeElement("div", "review-card__identity");
    var name = makeElement("p", "review-card__name", displayName);
    var date = makeElement("p", "review-card__date", formatDate(review.createdAt));
    var rating = makeElement("div", "review-card__rating");

    avatar.setAttribute("aria-hidden", "true");
    identity.appendChild(name);
    if (date.textContent) identity.appendChild(date);
    author.appendChild(avatar);
    author.appendChild(identity);

    if (review.rating > 0) {
      var stars = makeElement("div", "review-stars");
      appendStars(stars, review.rating, "stars review-stars");
      stars.setAttribute("role", "img");
      stars.setAttribute("aria-label", t("reviews.ratingLabel", { n: review.rating }));
      rating.appendChild(stars);
    } else {
      rating.appendChild(makeElement("span", "review-card__no-rating", t("reviews.noRating")));
    }

    head.appendChild(author);
    head.appendChild(rating);
    card.appendChild(head);
    card.appendChild(makeElement("p", "review-card__text", review.description));

    if (review.pros || review.cons) {
      var lists = makeElement("div", "review-card__lists");
      if (review.pros) lists.appendChild(buildListBlock("pros", t("reviews.prosLabel"), review.pros));
      if (review.cons) lists.appendChild(buildListBlock("cons", t("reviews.consLabel"), review.cons));
      if (!review.pros || !review.cons) lists.classList.add("review-card__lists--single");
      card.appendChild(lists);
    }

    if (review.replies.length) card.appendChild(buildRepliesBlock(review.replies));

    var actions = makeElement("div", "review-card__actions");
    var replyToggle = makeElement("button", "review-reply-toggle", t("reviews.reply"));
    replyToggle.type = "button";
    replyToggle.setAttribute("aria-expanded", "false");
    actions.appendChild(replyToggle);
    card.appendChild(actions);
    card.appendChild(buildReplyForm(review, index, replyToggle));

    return card;
  }

  function buildListBlock(type, title, text) {
    var block = makeElement("div", "review-list-block review-list-block--" + type);
    block.appendChild(makeElement("h3", "review-list-block__title", title));
    block.appendChild(makeElement("p", "", text));
    return block;
  }

  function buildReply(reply) {
    var node = makeElement("div", "review-reply");
    var head = makeElement("div", "review-reply__head");
    var name = makeElement("span", "review-reply__name", reply.name || t("reviews.anonymous"));
    var date = makeElement("span", "review-reply__date", formatDate(reply.createdAt));
    head.appendChild(name);
    if (date.textContent) head.appendChild(date);
    node.appendChild(head);
    node.appendChild(makeElement("p", "review-reply__text", reply.text));
    return node;
  }

  function buildRepliesBlock(replies) {
    var block = makeElement("div", "review-replies");
    block.appendChild(makeElement("h3", "review-replies__title", t("reviews.replies") + " · " + replies.length));
    replies.forEach(function (reply) {
      block.appendChild(buildReply(reply));
    });
    return block;
  }

  function buildReplyForm(review, index, toggle) {
    var formId = "reply-form-" + index;
    var nameId = formId + "-name";
    var textId = formId + "-text";
    var replyForm = makeElement("form", "reply-form");
    var replyBusy = false;
    replyForm.id = formId;
    replyForm.hidden = true;
    replyForm.setAttribute("novalidate", "");
    replyForm.appendChild(makeElement("h3", "reply-form__title", t("reviews.replyTitle")));

    var nameField = makeElement("div", "form-field");
    var nameLabel = makeElement("label", "", t("reviews.replyName"));
    nameLabel.setAttribute("for", nameId);
    var replyName = document.createElement("input");
    replyName.className = "form-input";
    replyName.id = nameId;
    replyName.name = "name";
    replyName.type = "text";
    replyName.maxLength = 40;
    replyName.autocomplete = "nickname";
    replyName.placeholder = t("reviews.replyNamePlaceholder");
    nameField.appendChild(nameLabel);
    nameField.appendChild(replyName);

    var textField = makeElement("div", "form-field");
    var textLabel = makeElement("label", "", t("reviews.replyText"));
    textLabel.setAttribute("for", textId);
    var replyText = document.createElement("textarea");
    replyText.className = "form-input form-textarea";
    replyText.id = textId;
    replyText.name = "text";
    replyText.maxLength = 600;
    replyText.placeholder = t("reviews.replyPlaceholder");
    textField.appendChild(textLabel);
    textField.appendChild(replyText);

    var honeypot = makeElement("div", "form-honeypot");
    honeypot.setAttribute("aria-hidden", "true");
    var honeypotLabel = makeElement("label", "", "Website");
    honeypotLabel.setAttribute("for", formId + "-website");
    var honeypotInput = document.createElement("input");
    honeypotInput.id = formId + "-website";
    honeypotInput.name = "website";
    honeypotInput.type = "text";
    honeypotInput.tabIndex = -1;
    honeypotInput.autocomplete = "off";
    honeypot.appendChild(honeypotLabel);
    honeypot.appendChild(honeypotInput);

    var replyStatus = makeElement("p", "form-status");
    replyStatus.setAttribute("role", "status");
    replyStatus.setAttribute("aria-live", "polite");

    var actions = makeElement("div", "reply-form__actions");
    var send = makeElement("button", "btn btn--primary reply-form__submit");
    var sendLabel = makeElement("span", "", t("reviews.replySubmit"));
    send.type = "submit";
    send.appendChild(sendLabel);
    send.appendChild(makeElement("span", "btn__icon", "↗"));
    var cancel = makeElement("button", "link-btn", t("reviews.replyCancel"));
    cancel.type = "button";
    actions.appendChild(send);
    actions.appendChild(cancel);

    replyForm.appendChild(nameField);
    replyForm.appendChild(textField);
    replyForm.appendChild(honeypot);
    replyForm.appendChild(replyStatus);
    replyForm.appendChild(actions);

    function setReplyStatus(key, isError) {
      replyStatus.textContent = key ? t(key) : "";
      replyStatus.classList.toggle("is-error", Boolean(key) && isError);
    }

    function setReplyBusy(busy) {
      replyBusy = busy;
      send.disabled = busy;
      sendLabel.textContent = t(busy ? "reviews.replySending" : "reviews.replySubmit");
    }

    toggle.setAttribute("aria-controls", formId);
    toggle.addEventListener("click", function () {
      replyForm.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      replyText.focus();
    });

    cancel.addEventListener("click", function () {
      replyForm.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      replyForm.reset();
      setReplyStatus("", false);
    });

    [replyName, replyText].forEach(function (input) {
      input.addEventListener("input", function () {
        if (replyStatus.textContent) setReplyStatus("", false);
      });
    });

    replyForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (replyBusy) return;
      var text = replyText.value.trim();
      if (!text) {
        setReplyStatus("reviews.replyError", true);
        replyText.focus();
        return;
      }
      if (text.length < minReply) {
        setReplyStatus("reviews.replyErrorShort", true);
        replyText.focus();
        return;
      }

      var payload = {
        name: replyName.value.trim().slice(0, 40),
        text: text.slice(0, 600),
        website: honeypotInput.value.trim()
      };

      setReplyStatus("", false);

      if (state.mode === "local") {
        if (addReplyLocally(review.id, payload)) {
          render();
          return;
        }
        setReplyStatus("reviews.replyErrorSubmit", true);
        return;
      }

      setReplyBusy(true);
      submitReplyToApi(review.id, payload).then(function (updated) {
        replaceReview(updated);
        render();
      }).catch(function () {
        setReplyBusy(false);
        setReplyStatus("reviews.replyErrorSubmit", true);
      });
    });

    return replyForm;
  }

  function renderList() {
    if (!listNode) return;
    while (listNode.firstChild) listNode.removeChild(listNode.firstChild);
    state.reviews.forEach(function (review, index) {
      listNode.appendChild(buildReviewCard(review, index));
    });
    if (emptyNode) emptyNode.hidden = state.reviews.length > 0;
  }

  function renderNote() {
    if (!noteNode) return;
    var local = state.mode === "local";
    noteNode.textContent = t(local ? "reviews.localNotice" : "reviews.formNote");
    noteNode.classList.toggle("is-local", local);
  }

  function render() {
    renderSummary();
    renderList();
    renderNote();
  }

  function fetchReviews() {
    if (window.location.protocol === "file:" || typeof window.fetch !== "function") {
      return Promise.resolve(null);
    }
    return fetch(apiUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("reviews request failed");
      return response.json();
    }).then(function (data) {
      var list = Array.isArray(data) ? data : data && data.reviews;
      if (!Array.isArray(list)) throw new Error("invalid reviews payload");
      return sortReviews(list.map(normalizeReview).filter(Boolean)).slice(0, 200);
    });
  }

  function useLocal() {
    state.mode = "local";
    state.reviews = readLocal();
    render();
  }

  function loadReviews() {
    fetchReviews().then(function (list) {
      if (!list) {
        useLocal();
        return;
      }
      state.mode = "api";
      state.reviews = list;
      render();
    }).catch(function () {
      useLocal();
    });
  }

  function setRating(value) {
    var numeric = Number(value);
    if (!isFinite(numeric)) numeric = 0;
    state.rating = Math.max(0, Math.min(5, Math.round(numeric)));
    if (ratingValue) ratingValue.value = String(state.rating);
    starButtons.forEach(function (button) {
      var star = Number(button.getAttribute("data-star"));
      var selected = star === state.rating;
      button.classList.toggle("is-active", star <= state.rating);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.setAttribute("aria-label", star + " — " + t("reviews.rating" + star));
    });
    if (ratingLabel) ratingLabel.textContent = t("reviews.rating" + state.rating);
  }

  function setBusy(busy) {
    state.busy = busy;
    if (submitButton) submitButton.disabled = busy;
    if (submitLabel) submitLabel.textContent = t(busy ? "reviews.sending" : "reviews.submit");
  }

  function setStatus(key, isError) {
    state.statusKey = key || "";
    state.statusError = Boolean(key) && isError;
    if (!statusNode) return;
    statusNode.textContent = key ? t(key) : "";
    statusNode.classList.toggle("is-error", state.statusError);
    statusNode.classList.toggle("is-success", Boolean(key) && !isError);
  }

  function submitToApi(payload) {
    if (window.location.protocol === "file:" || typeof window.fetch !== "function") {
      return Promise.reject(new Error("api unavailable"));
    }
    return fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) {
        var error = new Error("review submit failed");
        error.status = response.status;
        throw error;
      }
      return response.json();
    }).then(function (data) {
      var review = normalizeReview(data && data.review ? data.review : data);
      if (!review) throw new Error("invalid review response");
      return review;
    });
  }

  function submitReplyToApi(reviewId, payload) {
    if (window.location.protocol === "file:" || typeof window.fetch !== "function") {
      return Promise.reject(new Error("api unavailable"));
    }
    return fetch(apiUrl + "/" + encodeURIComponent(reviewId) + "/replies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) throw new Error("reply submit failed");
      return response.json();
    }).then(function (data) {
      var review = normalizeReview(data && data.review ? data.review : data);
      if (!review) throw new Error("invalid reply response");
      return review;
    });
  }

  function addReviewLocally(payload) {
    var review = normalizeReview({
      id: createId(),
      name: payload.name,
      rating: payload.rating,
      description: payload.description,
      pros: payload.pros,
      cons: payload.cons,
      replies: [],
      createdAt: new Date().toISOString()
    });
    if (!review) return false;
    var local = readLocal();
    local = sortReviews([review].concat(local)).slice(0, storageLimit);
    writeLocal(local);
    state.mode = "local";
    state.reviews = local;
    render();
    return true;
  }

  function replaceReview(updated) {
    for (var index = 0; index < state.reviews.length; index += 1) {
      if (state.reviews[index].id === updated.id) {
        state.reviews[index] = updated;
        return;
      }
    }
    state.reviews = sortReviews([updated].concat(state.reviews));
  }

  function addReplyLocally(reviewId, payload) {
    var local = readLocal();
    var updated = false;
    local = local.map(function (review) {
      if (review.id !== reviewId) return review;
      var reply = normalizeReply({
        id: createId(),
        name: payload.name,
        text: payload.text,
        createdAt: new Date().toISOString()
      });
      if (!reply) return review;
      review.replies = review.replies.concat(reply);
      updated = true;
      return review;
    });
    if (!updated) return false;
    writeLocal(local);
    state.mode = "local";
    state.reviews = local;
    return true;
  }

  if (starButtons.length) {
    starButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var star = Number(button.getAttribute("data-star"));
        setRating(star === state.rating ? 0 : star);
      });
    });
  }

  if (ratingReset) {
    ratingReset.addEventListener("click", function () {
      setRating(0);
    });
  }

  [nameInput, emailInput, descriptionInput, prosInput, consInput].forEach(function (input) {
    if (!input) return;
    input.addEventListener("input", function () {
      if (state.statusKey) setStatus("", false);
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (state.busy) return;

    var email = emailInput ? emailInput.value.trim() : "";
    if (!isValidEmail(email)) {
      setStatus("reviews.errorEmail", true);
      if (emailInput) emailInput.focus();
      return;
    }

    var description = descriptionInput ? descriptionInput.value.trim() : "";
    if (!description) {
      setStatus("reviews.errorRequired", true);
      if (descriptionInput) descriptionInput.focus();
      return;
    }
    if (description.length < minDescription) {
      setStatus("reviews.errorShort", true);
      if (descriptionInput) descriptionInput.focus();
      return;
    }

    var payload = {
      name: nameInput ? nameInput.value.trim().slice(0, 60) : "",
      email: email,
      rating: state.rating,
      description: description.slice(0, 1200),
      pros: prosInput ? prosInput.value.trim().slice(0, 400) : "",
      cons: consInput ? consInput.value.trim().slice(0, 400) : "",
      website: websiteInput ? websiteInput.value.trim() : ""
    };

    setStatus("", false);
    setBusy(true);

    submitToApi(payload).then(function (review) {
      state.mode = "api";
      state.reviews = sortReviews([review].concat(state.reviews));
      render();
      form.reset();
      setRating(0);
      setStatus("reviews.success", false);
    }).catch(function (error) {
      if (error && error.status === 400) {
        setStatus("reviews.errorSubmit", true);
        return;
      }
      if (!addReviewLocally(payload)) {
        setStatus("reviews.errorSubmit", true);
        return;
      }
      form.reset();
      setRating(0);
      setStatus("reviews.successLocal", false);
    }).then(function () {
      setBusy(false);
    });
  });

  document.addEventListener("languagechange", function () {
    setRating(state.rating);
    setBusy(state.busy);
    if (state.statusKey) setStatus(state.statusKey, state.statusError);
    render();
  });

  function init() {
    setRating(0);
    loadReviews();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
