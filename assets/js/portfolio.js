"use strict";

const Navigation = document.querySelector(".sidebar nav");
const NavigationLinks = Array.from(Navigation.querySelectorAll("a"));
const Sections = NavigationLinks.map(function(Link)
{
    return document.querySelector(Link.getAttribute("href"));
});
const ExpandButtons = document.querySelectorAll("[data-expand-group]");
const MediaDialog = document.getElementById("media-dialog");
const DialogImage = document.getElementById("dialog-image");
const MediaTitle = document.getElementById("media-title");
const MediaStatus = MediaDialog.querySelector("p");
const CopyStatus = document.getElementById("copy-status");
let ScrollScheduled = false;
let CopyStatusTimeoutId = 0;

function UpdateNavigation()
{
    ScrollScheduled = false;
    let ActiveIndex = 0;
    let Threshold = 100;

    if (window.innerWidth > 900)
    {
        Threshold = 80;
    }

    Sections.forEach(function(Section, Index)
    {
        if (Section.getBoundingClientRect().top <= Threshold)
        {
            ActiveIndex = Index;
        }
    });

    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4)
    {
        ActiveIndex = Sections.length - 1;
    }

    NavigationLinks.forEach(function(Link, Index)
    {
        const IsActive = Index === ActiveIndex;
        Link.classList.toggle("active", IsActive);

        if (IsActive)
        {
            Link.setAttribute("aria-current", "location");
            return;
        }

        Link.removeAttribute("aria-current");
    });

    if (window.innerWidth <= 900)
    {
        const ActiveLink = NavigationLinks[ActiveIndex];
        const LinkBounds = ActiveLink.getBoundingClientRect();
        const NavBounds = Navigation.getBoundingClientRect();

        if (LinkBounds.left < NavBounds.left || LinkBounds.right > NavBounds.right)
        {
            Navigation.scrollLeft += LinkBounds.left - NavBounds.left - 16;
        }
    }
}

function ScheduleNavigationUpdate()
{
    if (ScrollScheduled)
    {
        return;
    }

    ScrollScheduled = true;
    window.requestAnimationFrame(UpdateNavigation);
}

function OpenLinkedDetails(Hash)
{
    if (Hash.length < 2)
    {
        return;
    }

    const Target = document.getElementById(Hash.slice(1));

    if (Target === null)
    {
        return;
    }

    const LinkedDetails = Target.closest("details");

    if (LinkedDetails === null)
    {
        return;
    }

    LinkedDetails.open = true;
    window.requestAnimationFrame(function()
    {
        Target.scrollIntoView({ block: "start" });
    });
}

function SyncExpandButton(Button)
{
    const Group = document.getElementById(Button.dataset.expandGroup);
    const Items = Array.from(Group.querySelectorAll("details"));
    const IsAllOpen = Items.every(function(Item)
    {
        return Item.open;
    });

    Button.setAttribute("aria-expanded", String(IsAllOpen));

    if (IsAllOpen)
    {
        Button.textContent = "모두 접기 −";
        return;
    }

    Button.textContent = "모두 펼치기 +";
}

function OpenMedia(Button)
{
    MediaTitle.textContent = Button.dataset.title;
    DialogImage.alt = Button.dataset.title + " 구현 시연";
    MediaStatus.textContent = "시연을 불러오는 중입니다…";
    MediaDialog.showModal();
    document.body.classList.add("media-open");
    DialogImage.src = Button.dataset.media;
}

function CloseMedia()
{
    MediaDialog.close();
}

function ShowCopyStatus(Message)
{
    window.clearTimeout(CopyStatusTimeoutId);
    CopyStatus.textContent = Message;
    CopyStatusTimeoutId = window.setTimeout(function()
    {
        CopyStatus.textContent = "";
        CopyStatusTimeoutId = 0;
    }, 2500);
}

async function CopyEmail()
{
    const Email = "rudwo1590@gmail.com";

    try
    {
        if (navigator.clipboard === undefined)
        {
            throw new Error("Clipboard unavailable");
        }

        await navigator.clipboard.writeText(Email);
        ShowCopyStatus("이메일 주소를 복사했습니다.");
    }
    catch
    {
        const EmailLink = document.getElementById("contact-email");
        const Selection = window.getSelection();
        const EmailRange = document.createRange();
        EmailRange.selectNodeContents(EmailLink.firstChild);
        Selection.removeAllRanges();
        Selection.addRange(EmailRange);
        ShowCopyStatus("이메일 주소를 선택했습니다. Ctrl+C 또는 복사 메뉴를 사용해 주세요.");
    }
}

ExpandButtons.forEach(function(Button)
{
    const Group = document.getElementById(Button.dataset.expandGroup);
    Button.setAttribute("aria-controls", Group.id);

    Button.addEventListener("click", function()
    {
        const ShouldOpen = Button.getAttribute("aria-expanded") === "false";

        Group.querySelectorAll("details").forEach(function(Item)
        {
            Item.open = ShouldOpen;
        });

        SyncExpandButton(Button);
    });

    Group.querySelectorAll("details").forEach(function(Item)
    {
        Item.addEventListener("toggle", function()
        {
            SyncExpandButton(Button);
            ScheduleNavigationUpdate();
        });
    });

    SyncExpandButton(Button);
});

document.querySelectorAll('a[href^="#"]').forEach(function(Link)
{
    Link.addEventListener("click", function()
    {
        OpenLinkedDetails(Link.getAttribute("href"));
    });
});

document.querySelectorAll("[data-media]").forEach(function(Button)
{
    Button.addEventListener("click", function()
    {
        OpenMedia(Button);
    });
});

DialogImage.addEventListener("load", function()
{
    MediaStatus.textContent = "프로젝트 구현 시연 · GIF";
});

DialogImage.addEventListener("error", function()
{
    MediaStatus.textContent = "시연을 불러오지 못했습니다. 프로젝트의 시연 영상 링크를 확인해 주세요.";
});

document.getElementById("close-media").addEventListener("click", CloseMedia);

MediaDialog.addEventListener("click", function(Event)
{
    const Bounds = MediaDialog.getBoundingClientRect();

    if (Event.clientX < Bounds.left || Event.clientX > Bounds.right || Event.clientY < Bounds.top || Event.clientY > Bounds.bottom)
    {
        CloseMedia();
    }
});

MediaDialog.addEventListener("close", function()
{
    document.body.classList.remove("media-open");
    DialogImage.removeAttribute("src");
});

document.getElementById("copy-email").addEventListener("click", CopyEmail);
window.addEventListener("scroll", ScheduleNavigationUpdate, { passive: true });
window.addEventListener("resize", ScheduleNavigationUpdate);
window.addEventListener("hashchange", function()
{
    OpenLinkedDetails(window.location.hash);
});

OpenLinkedDetails(window.location.hash);
UpdateNavigation();
